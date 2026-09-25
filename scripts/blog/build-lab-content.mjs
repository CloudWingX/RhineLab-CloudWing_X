import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { load as parseYaml } from "js-yaml";
import {
  isPublished,
  labCollectionsSchema,
  postSchema,
} from "../../apps/blog/src/content/schema.mjs";

// 生成三维档案入口的公开内容目录。只包含公开文章；同一真实文章可在多个槽位
// 重复映射，但不创建第二份文章、ID 或 canonical。
//
// 输出：.generated/lab-content.json（gitignored，构建时生成）。

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const postsDir = resolve(root, "content/posts");
const collectionsFile = resolve(root, "content/lab-collections.json");
const outFile = resolve(root, ".generated/lab-content.json");
const SITE = process.env.BLOG_SITE_ORIGIN || "https://example.com";
const SLOTS_PER_THEME = 8;

const now = process.env.BUILD_NOW ? new Date(process.env.BUILD_NOW) : new Date();
if (Number.isNaN(now.getTime())) {
  console.error(`BUILD_NOW 不是有效日期：${process.env.BUILD_NOW}`);
  process.exit(1);
}

const errors = [];

// 读取并校验文章。
const posts = [];
for (const name of (await readdir(postsDir)).filter((n) => n.endsWith(".md")).sort()) {
  const raw = await readFile(resolve(postsDir, name), "utf8");
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  if (!match) {
    errors.push(`${name}：缺少 frontmatter`);
    continue;
  }
  const parsed = postSchema.safeParse(parseYaml(match[1]) ?? {});
  if (!parsed.success) {
    errors.push(`${name}：${parsed.error.issues.map((i) => i.message).join("；")}`);
    continue;
  }
  posts.push(parsed.data);
}

const published = posts.filter((post) => isPublished(post, now));
const byId = new Map(published.map((post) => [post.id, post]));

let collections;
try {
  collections = labCollectionsSchema.parse(JSON.parse(await readFile(collectionsFile, "utf8")));
} catch (error) {
  errors.push(`content/lab-collections.json：${error.message}`);
}

const records = [];
let displayNumber = 0;
if (collections) {
  collections.themes.forEach((theme) => {
    const assigned = theme.postIds.map((id) => byId.get(id)).filter(Boolean);
    for (const id of theme.postIds) {
      if (!byId.has(id)) errors.push(`主题「${theme.name}」引用了未公开或不存在的文章 ${id}`);
    }
    // 主题为空时回退到全部公开文章，避免空槽崩溃；不制造假文章。
    // 真正的“空主题装饰/不可选”留待可进行浏览器视觉验证时实现。
    const pool = assigned.length ? assigned : published;
    for (let slot = 0; slot < SLOTS_PER_THEME && pool.length > 0; slot += 1) {
      const post = pool[slot % pool.length];
      displayNumber += 1;
      records.push({
        id: `X-${String(displayNumber).padStart(3, "0")}`,
        displayNumber,
        postId: post.id,
        title: post.title,
        en: post.title,
        department: theme.name,
        category: theme.name,
        date: post.publishedAt.toISOString().slice(0, 10),
        lead: post.author,
        clearance: "PUBLIC",
        abstract: post.description,
        findings: [post.description],
        source: new URL(post.path, SITE).href,
        href: post.path,
      });
    }
  });
}

// ── 图像档案（图集）──────────────────────────────────────────────────────
// content/gallery.json 与 lab-collections.json 同级，都是"内容侧唯一数据源"。
// 这里把它转成档案系统的影像档案记录。影像档案**不进三维阵列**（columns 仍是
// 5 个策展主题），所以单独放 albums 数组，不与 records 混在一起。
const galleryFile = resolve(root, "content/gallery.json");
const blogPublicDir = resolve(root, "apps/blog/public");

const albums = [];
let gallery = null;
try {
  gallery = JSON.parse(await readFile(galleryFile, "utf8"));
} catch (error) {
  errors.push(`content/gallery.json：${error.message}`);
}

if (gallery) {
  const items = Array.isArray(gallery.items) ? gallery.items : [];
  const categories = Array.isArray(gallery.categories) ? gallery.categories : [];

  // 收集大类里声明的图集名，并挡住"同一图集被归入两个大类"。
  const albumNames = [];
  for (const category of categories) {
    if (!category || typeof category.name !== "string" || !Array.isArray(category.albums)) {
      errors.push("content/gallery.json：大类条目缺少 name 或 albums");
      continue;
    }
    for (const album of category.albums) {
      if (albumNames.includes(album)) {
        errors.push(`content/gallery.json：图集「${album}」被归入多个大类`);
      }
      albumNames.push(album);
    }
  }

  // 双向对账：每条影像都要有归属；每个图集都要有影像。
  const unclassified = [...new Set(items.map((i) => i.game))].filter(
    (game) => !albumNames.includes(game),
  );
  if (unclassified.length) {
    errors.push(`content/gallery.json：以下图集未归入任何大类：${unclassified.join("、")}`);
  }
  const phantom = albumNames.filter((album) => !items.some((i) => i.game === album));
  if (phantom.length) {
    errors.push(`content/gallery.json：大类里声明了没有影像的图集：${phantom.join("、")}`);
  }

  let albumNumber = 0;
  for (const category of categories) {
    for (const album of category.albums ?? []) {
      const albumItems = items
        .filter((item) => item.game === album)
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));
      if (!albumItems.length) continue; // 空图集已在上面报错
      albumNumber += 1;

      // 每条影像的素材必须真实存在——缺素材时构建失败，而不是发出坏图。
      for (const item of albumItems) {
        try {
          await stat(resolve(blogPublicDir, String(item.image).replace(/^\//, "")));
        } catch {
          errors.push(
            `content/gallery.json：图集「${album}」的影像「${item.image}」在 apps/blog/public 中不存在`,
          );
        }
      }

      const dates = albumItems.map((item) => String(item.date)).filter(Boolean).sort();
      albums.push({
        id: `AL-${String(albumNumber).padStart(3, "0")}`,
        kind: "album",
        displayNumber: albumNumber,
        title: album,
        en: album,
        department: category.name,
        category: category.name,
        count: albumItems.length,
        dateFrom: dates[0] ?? "",
        dateTo: dates.at(-1) ?? "",
        cover: albumItems.at(-1)?.image ?? "",
        // 展示顺序取时间倒序（新的在前）
        images: [...albumItems].reverse().map((item) => ({
          src: item.image,
          title: item.title,
          date: item.date,
          aspect: item.aspect,
        })),
      });
    }
  }

  const counted = albums.reduce((sum, album) => sum + album.count, 0);
  if (counted !== items.length) {
    errors.push(
      `content/gallery.json：图集张数合计 ${counted}，但 items 有 ${items.length} 条`,
    );
  }
}

if (errors.length) {
  console.error(`生成三维内容失败：\n- ${errors.join("\n- ")}`);
  process.exit(1);
}

await mkdir(resolve(root, ".generated"), { recursive: true });
await writeFile(
  outFile,
  `${JSON.stringify(
    {
      generatedAt: now.toISOString(),
      site: SITE,
      columns: collections.themes.map((theme) => theme.name),
      categories: collections.themes.map((theme) => theme.name),
      records,
      albums,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(
  `三维内容生成：${records.length} 个槽位（${collections.themes.length} 主题 × ${SLOTS_PER_THEME}），` +
    `引用 ${new Set(records.map((r) => r.postId)).size} 篇公开文章；` +
    `影像档案 ${albums.length} 个（${albums.reduce((sum, album) => sum + album.count, 0)} 张，` +
    `${new Set(albums.map((a) => a.category)).size} 个大类）。`,
);
