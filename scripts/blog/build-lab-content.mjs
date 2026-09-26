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
// 与 apps/blog/astro.config.mjs 的默认保持一致：档案里的 source（导出的 TXT 也会写它）
// 必须是本站的 origin，否则下载下来的记录里"原文链接"指向 example.com。
const SITE = process.env.BLOG_SITE_ORIGIN || "https://www.cloudwing.top";
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
        kind: "post",
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
// 这里把它转成档案记录，并**并入同一个 records 数组**：三维阵列按 category 分列
// （见 data.ts 的 fileLocation），所以「游戏影像 / 影像图集」会成为阵列里真实存在的
// 两列，能用 ↑↓←→ 走到、能打开档案详情——而不是藏在检索弹框的第 8 个筛选项里。
const galleryFile = resolve(root, "content/gallery.json");
const blogPublicDir = resolve(root, "apps/blog/public");

/** 影像大类，按 gallery.json 的声明顺序；追加到 columns 后面成为阵列的第 6、7 列。 */
const albumCategories = [];
let albumImageTotal = 0;

/**
 * 图集的影像**只存一份**：`albumKey -> images[]`，槽位本身不重复携带。
 *
 * 槽位按模板的 SLOTS_PER_THEME 循环补位（与文章主题同一规则），因此同一个图集会在
 * 一列里出现多次。如果让每个槽位各带一份 images[]，产物会从 132 条膨胀到 413 条
 * （首屏 JSON 约 +42KB）；这里只写一次，由 adapter 把同一份数组引用挂到每个槽位上，
 * 运行时共享、JSON 不重复。
 */
const albumImages = {};

/** 音乐大类：每首歌各成一条档案，成为阵列的最后一列（与影集同构）。 */
const MUSIC_CATEGORY = "音乐";
/** 歌曲的**去重**条数（槽位数是补位后的，日志里分开播报）。 */
let musicDistinct = 0;
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

  for (const category of categories) {
    if (!albumCategories.includes(category.name)) albumCategories.push(category.name);

    // 先把该类目下的图集收齐（含素材校验），再按模板同一规则铺满 SLOTS_PER_THEME 个槽位。
    const albums = [];
    for (const album of category.albums ?? []) {
      const albumItems = items
        .filter((item) => item.game === album)
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));
      if (!albumItems.length) continue; // 空图集已在上面报错

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
        name: album,
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
    if (!albums.length) continue;

    // 与文章主题同一规则：一列恰好 SLOTS_PER_THEME 个槽位，不足则循环补位。
    for (let slot = 0; slot < SLOTS_PER_THEME; slot += 1) {
      const album = albums[slot % albums.length];
      // 影像只写一次（首次遇到该图集时），槽位只带 albumKey。
      if (!albumImages[album.name]) {
        albumImages[album.name] = album.images;
        albumImageTotal += album.count;
      }
      displayNumber += 1;
      records.push({
        id: `X-${String(displayNumber).padStart(3, "0")}`,
        displayNumber,
        kind: "album",
        // 影像档案没有文章：postId / href 留空，由 adapter 按 kind 分别校验。
        postId: "",
        href: "",
        title: album.name,
        en: album.name,
        department: category.name,
        category: category.name,
        date: album.dateTo,
        lead: "IMAGE ARCHIVE",
        clearance: "PUBLIC",
        abstract: `${album.name} 图集，属「${category.name}」，共 ${album.count} 张影像，时间跨度 ${album.dateFrom} 至 ${album.dateTo}。`,
        findings: [],
        source: "",
        // 图片本体在产物顶层的 albumImages 里（只存一份），这里只留键。
        albumKey: album.name,
        count: album.count,
        dateFrom: album.dateFrom,
        dateTo: album.dateTo,
        cover: album.cover,
      });
    }
  }

  if (albumImageTotal !== items.length) {
    errors.push(
      `content/gallery.json：图集张数合计 ${albumImageTotal}，但 items 有 ${items.length} 条`,
    );
  }
}

// ── 音乐（曲目表）────────────────────────────────────────────────────────
// content/music.json 是"内容侧唯一数据源"，这里把它转成**档案记录**并入 records ——
// 与影集同一套做法：一条记录 = 一首歌，按 category 分列，于是「音乐」就是阵列里的一列。
// 只做两件事：并入 records，并校验每条曲目的音频与封面在 public/music 里真实存在 ——
// 缺素材就中断构建，而不是发出一个"点了没声音"的播放器。
// ★路径保持站内相对形态（/music/…）★：lab 应用用 assetUrl() 解析（自动带上 /lab/ 前缀），
// 所以这里不写死 base。
const musicFile = resolve(root, "content/music.json");
const musicPublicDir = resolve(root, "public");

let musicCount = 0;
try {
  const parsed = JSON.parse(await readFile(musicFile, "utf8"));
  const tracks = Array.isArray(parsed.tracks) ? parsed.tracks : [];
  // 素材校验只做一次（每个文件 stat 一遍），槽位补位在下面按模板规则铺满。
  const valid = [];
  for (const track of tracks) {
    if (!track || !track.id || !track.title) {
      errors.push("content/music.json：曲目缺少 id 或 title");
      continue;
    }
    for (const [key, value] of [
      ["src", track.src],
      ["cover", track.cover],
    ]) {
      const local = resolve(musicPublicDir, String(value ?? "").replace(/^\//, ""));
      try {
        await stat(local);
      } catch {
        errors.push(`content/music.json：曲目「${track.id}」的 ${key} 不存在：${value}`);
      }
    }
    valid.push(track);
  }
  musicDistinct = valid.length;
  if (valid.length) musicCount = 1;

  // 与文章主题、影像大类同一规则：一列恰好 SLOTS_PER_THEME 个槽位，不足则循环补位。
  for (let slot = 0; slot < SLOTS_PER_THEME && valid.length > 0; slot += 1) {
    const track = valid[slot % valid.length];
    const minutes = Math.floor((track.duration ?? 0) / 60);
    const seconds = String(Math.round((track.duration ?? 0) % 60)).padStart(2, "0");
    displayNumber += 1;
    records.push({
      id: `X-${String(displayNumber).padStart(3, "0")}`,
      displayNumber,
      kind: "music",
      // 音乐档案没有文章：postId / href 留空，由 adapter 按 kind 分别校验。
      postId: "",
      href: "",
      title: track.title,
      en: track.title,
      department: track.artist,
      category: MUSIC_CATEGORY,
      date: "",
      lead: track.artist,
      clearance: "PUBLIC",
      abstract: `${track.title} —— ${track.artist}《${track.album}》。${
        track.instrumental ? "纯音乐。" : "带同步歌词。"
      }时长 ${minutes}:${seconds}。`,
      findings: [],
      source: "",
      // 播放器要用的字段（数据侧原样带过来，应用只读它，不另存一份）。
      artist: track.artist,
      album: track.album,
      src: track.src,
      cover: track.cover,
      instrumental: Boolean(track.instrumental),
      duration: track.duration,
      sizeMB: track.sizeMB,
      bitrate: track.bitrate,
      origin: track.origin,
    });
  }
} catch (error) {
  errors.push(`content/music.json：${error.message}`);
}

// ── 网站导航（一个大类 = 一列；列里的每条档案 = 一个分组）──────────────────
// ★结构与影像档案完全同构★：`content/nav.json` 的每个分组 = 一条档案（小类），
// 分组里的站点 = 这条档案的内容（详情面板的「浏览站点」把它开成浮层）。
// 因此整块只占**一列**（大类名 = 网站导航），而不是每个分组各占一列。
const navFile = resolve(root, "content/nav.json");
const NAV_CATEGORY = "网站导航";
const navGroups = [];
let navItems = 0;

/** 展示用域名（去掉 www.）。生成期算好，详情面板与浮层直接用。 */
const hostOf = (value) => {
  try {
    return new URL(value).host.replace(/^www\./, "");
  } catch {
    return "";
  }
};

try {
  const parsed = JSON.parse(await readFile(navFile, "utf8"));
  for (const group of Array.isArray(parsed.groups) ? parsed.groups : []) {
    if (!group || typeof group.group !== "string" || !group.group.trim()) {
      errors.push("content/nav.json：有条目缺少 group 名称");
      continue;
    }
    const items = [];
    for (const item of Array.isArray(group.items) ? group.items : []) {
      if (!item || !item.name || !item.href) {
        errors.push(`content/nav.json：分组「${group.group}」有条目缺少 name 或 href`);
        continue;
      }
      try {
        const protocol = new URL(item.href).protocol;
        if (protocol !== "http:" && protocol !== "https:") throw new Error(protocol);
      } catch {
        errors.push(`content/nav.json：「${item.name}」的 href 不是 http(s) 地址：${item.href}`);
        continue;
      }
      // ★图标必须真实存在★：缺文件不会让别处失败，只会在浮层里显示成一个破图标 ——
      // 那是最难被发现的一类坏数据，所以在这里挡住。
      if (item.icon) {
        try {
          await stat(resolve(blogPublicDir, String(item.icon).replace(/^\//, "")));
        } catch {
          errors.push(
            `content/nav.json：「${item.name}」的 icon 在 apps/blog/public 中不存在：${item.icon}`,
          );
        }
      }
      items.push({
        name: item.name,
        url: item.href,
        tag: item.tag ?? "",
        desc: item.desc ?? "",
        icon: item.icon ?? "",
        host: hostOf(item.href),
      });
    }
    if (!items.length) continue; // 删空的分组：那条档案不出现
    navGroups.push({ name: group.group, hint: group.hint ?? "", items });
    navItems += items.length;
  }
} catch (error) {
  errors.push(`content/nav.json：${error.message}`);
}

// 与其余档案同一规则：一列恰好 SLOTS_PER_THEME 个槽位，不足循环补位
// （本站 6 个分组 → 补到 8 槽，前两个分组各重复一次）。
for (let slot = 0; slot < SLOTS_PER_THEME && navGroups.length > 0; slot += 1) {
  const group = navGroups[slot % navGroups.length];
  displayNumber += 1;
  records.push({
    id: `X-${String(displayNumber).padStart(3, "0")}`,
    displayNumber,
    kind: "siteGroup",
    // 站点档案没有文章：postId / href 留空，由 adapter 按 kind 分别校验。
    postId: "",
    href: "",
    title: group.name,
    en: group.name,
    department: NAV_CATEGORY,
    category: NAV_CATEGORY,
    date: "",
    lead: `${group.items.length} SITES`,
    clearance: "PUBLIC",
    abstract: `${group.name} —— ${group.hint || "站点收藏"}，收录 ${group.items.length} 个站点。`,
    findings: [],
    source: "",
    hint: group.hint,
    count: group.items.length,
    // 站点列表直接内嵌：只有几十条短记录，没有影像那种体积问题，
    // 所以不必像 albumImages 那样去重。
    items: group.items,
  });
}

if (errors.length) {
  console.error(`生成三维内容失败：\n- ${errors.join("\n- ")}`);
  process.exit(1);
}

// 阵列的列 = 文章主题 + 影像大类 + 音乐 + 网站导航分组。四者共用 data.ts 的 fileLocation 分列
// 逻辑，所以它们都是阵列里真实存在的列——顺序完全由数据决定，代码里不写死列数。
const columns = [
  ...collections.themes.map((theme) => theme.name),
  ...albumCategories,
  ...(musicCount ? [MUSIC_CATEGORY] : []),
  // 网站导航：**整块一列**（大类名），列里的每条档案才是分组
  ...(navGroups.length ? [NAV_CATEGORY] : []),
];

await mkdir(resolve(root, ".generated"), { recursive: true });
await writeFile(
  outFile,
  `${JSON.stringify(
    {
      generatedAt: now.toISOString(),
      site: SITE,
      columns,
      categories: columns,
      // 图集影像只存一份，按 albumKey 索引；槽位（records 里的影像档案）只带键。
      albumImages,
      records,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

const postRecords = records.filter((r) => r.kind === "post");
const siteRecords = records.filter((r) => r.kind === "siteGroup");
const albumRecords = records.filter((r) => r.kind === "album");
const songRecords = records.filter((r) => r.kind === "music");
// 槽位数与去重条数分开播报：影集/曲目列按模板规则循环补位，槽位会比图集/歌曲多。
const distinctAlbums = Object.keys(albumImages).length;
console.log(
  `三维内容生成：${columns.length} 列（${collections.themes.length} 文章主题 + ${albumCategories.length} 影像大类 + ${musicCount ? 1 : 0} 音乐 + ${navGroups.length ? 1 : 0} 网站导航）；` +
    `档案 ${records.length} 条 —— 文章 ${postRecords.length} 条（引用 ${new Set(postRecords.map((r) => r.postId)).size} 篇公开文章）、` +
    `影像 ${albumRecords.length} 槽（${distinctAlbums} 个图集 / ${albumImageTotal} 张，图片只存一份）、音乐 ${songRecords.length} 槽（${musicDistinct} 首）、` +
    `网站导航 ${siteRecords.length} 槽（${navGroups.length} 个分组 / ${navItems} 个站点）。` +
    `每列 ${SLOTS_PER_THEME} 槽。`,
);
