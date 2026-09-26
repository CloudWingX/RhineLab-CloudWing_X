import content from "../.generated/lab-content.json" with { type: "json" };

// 三维档案 adapter：读取构建时生成的公开内容目录，建立 postId -> href 索引，
// 并校验没有悬空引用。只读取公开文章摘要，不加载 Markdown 正文。
//
// records 里混有三类档案，用 kind 区分：
//   - kind "post"  文章档案：有 postId / href，指向博客文章（阅读层用）
//   - kind "album" 影像档案：一条记录 = 一个图集槽位（Minecraft / Peak / 黑暗之魂2 /
//                  AI生成 / 壁纸），没有文章，但需要 images[] 供 album-viewer 使用
//   - kind "music" 音乐档案：一条记录 = 一首歌的槽位
// 三类都**进三维阵列**：阵列的列由 columns 决定，records 按 category 分列，
// 因此「游戏影像 / 影像图集 / 音乐」就是阵列里真实存在的列，会被 ↑↓←→ 走到。
//
// ★影像槽位不携带图片本体★：图集按模板的 SLOTS_PER_THEME 循环补位，同一个图集会在
// 一列里出现多次；若每个槽位各带一份 images[]，产物会从 132 条膨胀到 413 条。生成物
// 因此把图片单独放在顶层 albumImages（按 albumKey 索引），由这里把**同一份数组引用**
// 挂到每个槽位上 —— 运行时共享，JSON 不重复。对消费方而言 LabAlbumSlot.images 照旧。

/** 影像档案（图集）里的一张影像。 */
export interface AlbumImage {
  src: string;
  title: string;
  date: string;
  aspect: string;
}

interface SlotBase {
  id: string;
  displayNumber: number;
  title: string;
  en: string;
  department: string;
  category: string;
  date: string;
  lead: string;
  clearance: string;
  abstract: string;
  findings: string[];
  source: string;
}

/** 文章档案：指向一篇博客文章。 */
export interface LabPostSlot extends SlotBase {
  kind: "post";
  postId: string;
  href: string;
}

/**
 * 影像档案：一个槽位对应一个图集。
 *
 * 它没有文章，所以 postId / href 是空串——保留这两个字段（而不是省略）是为了让
 * 消费方（详情面板、阅读层宿主端口）不必到处写分支；空串在 those 处会被 kind 判断挡掉。
 * `images` 在运行时由 adapter 从顶层 `albumImages` 挂上（多个槽位共享同一份数组）。
 */
export interface LabAlbumSlot extends SlotBase {
  kind: "album";
  postId: "";
  href: "";
  /** 指向顶层 `albumImages` 的键（= 图集名）。 */
  albumKey: string;
  count: number;
  dateFrom: string;
  dateTo: string;
  cover: string;
  images: AlbumImage[];
}

/** 网站导航里的一个站点。 */
export interface SiteItem {
  name: string;
  /** 外链（新标签打开） */
  url: string;
  tag: string;
  desc: string;
  /** 站内图标路径（/nav/xxx.png）；空串表示没有图标 */
  icon: string;
  /** 展示用域名（去掉 www.） */
  host: string;
}

/**
 * 网站导航档案：一个槽位对应一个**分组**（不是单个站点）。
 *
 * 与影像档案同构 —— 「网站导航」是一个大类（阵列里占**一列**），列里的每条档案是一个分组
 * （小类），分组里的站点是这条档案的内容（详情面板的「浏览站点」把它开成浮层）。
 * 和影像/音乐档案一样没有"文章"（postId / href 留空）。
 */
export interface LabSiteGroupSlot extends SlotBase {
  kind: "siteGroup";
  postId: "";
  href: "";
  /** 分组的说明（旧站 SITE_NAV 的 hint） */
  hint: string;
  /** 收录的站点数 = items.length */
  count: number;
  items: SiteItem[];
}

/**
 * 音乐档案：一个槽位对应一首歌（与影集同构，也进三维阵列的「音乐」列）。
 *
 * 和影像档案一样没有"文章"（postId / href 留空），但带播放器需要的曲目字段；
 * 歌词不进数据 —— 约定 `music/lyrics/<id>.lrc` 存在即自动同步。
 */
export interface LabMusicSlot extends SlotBase {
  kind: "music";
  postId: "";
  href: "";
  artist: string;
  album: string;
  /** 站内路径（/music/<id>.mp3）；lab 应用用 assetUrl() 解析成 /lab/music/… */
  src: string;
  cover: string;
  /** 纯音乐：没有歌词，歌词区显示占位语。 */
  instrumental: boolean;
  duration: number;
  sizeMB: number;
  bitrate: number;
  origin: string;
}

export type LabSlot = LabPostSlot | LabAlbumSlot | LabMusicSlot | LabSiteGroupSlot;

export interface LabContent {
  generatedAt: string;
  site: string;
  columns: string[];
  categories: string[];
  records: LabSlot[];
}

/** 生成物里影像槽位的形态：图片不进槽位（一张图只存一份），槽位只带 albumKey。 */
interface RawAlbumSlot extends Omit<LabAlbumSlot, "images"> {
  albumKey: string;
}
type RawLabSlot = LabPostSlot | RawAlbumSlot | LabMusicSlot | LabSiteGroupSlot;
interface RawLabContent extends Omit<LabContent, "records"> {
  /** 图集影像，按 albumKey 索引，整份产物里只存一次。 */
  albumImages?: Record<string, AlbumImage[]>;
  records: RawLabSlot[];
}

const raw = content as RawLabContent;
const albumImages = raw.albumImages ?? {};

const problems: string[] = [];
if (!Array.isArray(raw.columns) || raw.columns.length === 0) {
  problems.push("columns 必须是非空数组");
}
if (!Array.isArray(raw.categories)) problems.push("categories 必须是数组");
if (!Array.isArray(raw.records)) problems.push("records 必须是数组");

// 每一列都必须至少有一条档案：空列会让阵列里出现一条永远空着的泳道。
const usedCategories = new Set(raw.records.map((record) => record.category));
for (const column of raw.columns) {
  if (!usedCategories.has(column)) problems.push(`列「${column}」没有任何档案`);
}

const hrefByPostId = new Map<string, string>();
const seenIds = new Set<string>();
for (const record of raw.records) {
  if (!record.id || seenIds.has(record.id)) {
    problems.push(`档案 id 缺失或重复：${record.id}`);
  }
  seenIds.add(record.id);

  if (!record.category) {
    problems.push(`档案 ${record.id} 缺少 category`);
  } else if (!raw.columns.includes(record.category)) {
    problems.push(`档案 ${record.id} 的 category「${record.category}」不在 columns 里`);
  }

  // kind 来自 JSON，运行时按未知值校验一次，避免坏数据静默走错分支。
  const kind = (record as { kind?: unknown }).kind;
  if (kind !== "post" && kind !== "album" && kind !== "music" && kind !== "siteGroup") {
    problems.push(`档案 ${record.id} 的 kind 非法：${String(kind)}`);
    continue;
  }

  if (record.kind === "siteGroup") {
    if (!Array.isArray(record.items) || record.items.length === 0) {
      problems.push(`站点分组 ${record.id} 没有任何站点`);
      continue;
    }
    if (record.items.length !== record.count) {
      problems.push(
        `站点分组 ${record.id} 的 count=${record.count} 与 items=${record.items.length} 不符`,
      );
    }
    for (const item of record.items) {
      if (!/^https?:\/\//.test(item.url ?? "")) {
        problems.push(`站点分组 ${record.id} 的站点「${item.name}」url 不是 http(s)：${item.url}`);
      }
      if (item.icon && !item.icon.startsWith("/")) {
        problems.push(
          `站点分组 ${record.id} 的站点「${item.name}」icon 必须是站内绝对路径：${item.icon}`,
        );
      }
    }
    continue;
  }

  if (record.kind === "music") {
    for (const [key, value] of [
      ["src", record.src],
      ["cover", record.cover],
    ] as const) {
      if (!value || !value.startsWith("/")) {
        problems.push(`音乐档案 ${record.id} 的 ${key} 必须是站内绝对路径：${value}`);
      }
    }
    if (!Number.isFinite(record.duration) || record.duration <= 0) {
      problems.push(`音乐档案 ${record.id} 的 duration 必须是正数：${record.duration}`);
    }
    continue;
  }

  if (record.kind === "album") {
    // 图片本体在顶层 albumImages：槽位只带 albumKey，这里解析并校验引用是否成立。
    const images = albumImages[record.albumKey];
    if (!Array.isArray(images) || images.length === 0) {
      problems.push(
        `影像档案 ${record.id} 的 albumKey「${record.albumKey}」在 albumImages 里没有影像`,
      );
      continue;
    }
    if (images.length !== record.count) {
      problems.push(
        `影像档案 ${record.id} 的 count=${record.count} 与 images=${images.length} 不符`,
      );
    }
    for (const image of images) {
      if (!image.src || !image.src.startsWith("/")) {
        problems.push(`影像档案 ${record.id} 的影像 src 必须是站内绝对路径：${image.src}`);
      }
    }
    continue;
  }

  if (!record.postId || !record.href) {
    problems.push(`槽位 ${record.id} 缺少 postId 或 href`);
    continue;
  }
  if (!record.href.startsWith("/")) {
    problems.push(`槽位 ${record.id} 的 href 必须是站内绝对路径：${record.href}`);
  }
  const existing = hrefByPostId.get(record.postId);
  if (existing && existing !== record.href) {
    problems.push(`文章 ${record.postId} 在不同槽位的 href 不一致`);
  }
  hrefByPostId.set(record.postId, record.href);
}

if (problems.length) {
  throw new Error(`lab 内容校验失败：\n- ${problems.join("\n- ")}`);
}

// 把顶层 albumImages 的**同一份数组引用**挂到每个影像槽位上：内存里只有一份图集图片，
// 消费方（album-viewer / 详情面板）拿到的仍是 LabAlbumSlot.images。
const records: LabSlot[] = raw.records.map((record) =>
  record.kind === "album"
    ? { ...record, images: albumImages[record.albumKey] ?? [] }
    : record,
);

export const labContent: LabContent = { ...raw, records };
export const hasPosts = records.some((record) => record.kind === "post");
export const albums = records.filter(
  (record): record is LabAlbumSlot => record.kind === "album",
);
/** 影像大类，按 records 里首次出现的顺序（即 gallery.json 的声明顺序）。 */
export const albumCategories = [...new Set(albums.map((album) => album.category))];
/** 音乐档案（一条 = 一首歌的槽位）；素材是否到位由生成期校验，这里只管数据形态。 */
export const musicTracks = records.filter(
  (record): record is LabMusicSlot => record.kind === "music",
);
export function hrefForPost(postId: string): string | null {
  return hrefByPostId.get(postId) ?? null;
}
