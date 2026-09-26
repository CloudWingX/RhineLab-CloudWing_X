import content from "../.generated/lab-content.json" with { type: "json" };

// 三维档案 adapter：读取构建时生成的公开内容目录，建立 postId -> href 索引，
// 并校验没有悬空引用。只读取公开文章摘要，不加载 Markdown 正文。
//
// records 里混有两类档案，用 kind 区分：
//   - kind "post"  文章档案：有 postId / href，指向博客文章（阅读层用）
//   - kind "album" 影像档案：一条记录 = 一个图集（Minecraft / Peak / 黑暗之魂2 /
//                  AI生成 / 壁纸），没有文章，但带 images[] 供 album-viewer 使用
// 两类都**进三维阵列**：阵列的列由 columns 决定，records 按 category 分列，
// 因此「游戏影像 / 影像图集」就是阵列里真实存在的两列，会被 ↑↓←→ 走到。

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
 * 影像档案：一条记录对应一个图集。
 *
 * 它没有文章，所以 postId / href 是空串——保留这两个字段（而不是省略）是为了让
 * 消费方（详情面板、阅读层宿主端口）不必到处写分支；空串在 those 处会被 kind 判断挡掉。
 */
export interface LabAlbumSlot extends SlotBase {
  kind: "album";
  postId: "";
  href: "";
  count: number;
  dateFrom: string;
  dateTo: string;
  cover: string;
  images: AlbumImage[];
}

/**
 * 音乐档案：一条记录 = 一首歌（与影集同构，也进三维阵列的「音乐」列）。
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

export type LabSlot = LabPostSlot | LabAlbumSlot | LabMusicSlot;

export interface LabContent {
  generatedAt: string;
  site: string;
  columns: string[];
  categories: string[];
  records: LabSlot[];
}

const lab = content as LabContent;

const problems: string[] = [];
if (!Array.isArray(lab.columns) || lab.columns.length === 0) {
  problems.push("columns 必须是非空数组");
}
if (!Array.isArray(lab.categories)) problems.push("categories 必须是数组");
if (!Array.isArray(lab.records)) problems.push("records 必须是数组");

// 每一列都必须至少有一条档案：空列会让阵列里出现一条永远空着的泳道。
const usedCategories = new Set(lab.records.map((record) => record.category));
for (const column of lab.columns) {
  if (!usedCategories.has(column)) problems.push(`列「${column}」没有任何档案`);
}

const hrefByPostId = new Map<string, string>();
const seenIds = new Set<string>();
for (const record of lab.records) {
  if (!record.id || seenIds.has(record.id)) {
    problems.push(`档案 id 缺失或重复：${record.id}`);
  }
  seenIds.add(record.id);

  if (!record.category) {
    problems.push(`档案 ${record.id} 缺少 category`);
  } else if (!lab.columns.includes(record.category)) {
    problems.push(`档案 ${record.id} 的 category「${record.category}」不在 columns 里`);
  }

  // kind 来自 JSON，运行时按未知值校验一次，避免坏数据静默走错分支。
  const kind = (record as { kind?: unknown }).kind;
  if (kind !== "post" && kind !== "album" && kind !== "music") {
    problems.push(`档案 ${record.id} 的 kind 非法：${String(kind)}`);
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
    if (!Array.isArray(record.images) || record.images.length === 0) {
      problems.push(`影像档案 ${record.id} 没有任何影像`);
      continue;
    }
    if (record.images.length !== record.count) {
      problems.push(
        `影像档案 ${record.id} 的 count=${record.count} 与 images=${record.images.length} 不符`,
      );
    }
    for (const image of record.images) {
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

export const labContent = lab;
export const hasPosts = lab.records.some((record) => record.kind === "post");
export const albums = lab.records.filter(
  (record): record is LabAlbumSlot => record.kind === "album",
);
/** 影像大类，按 records 里首次出现的顺序（即 gallery.json 的声明顺序）。 */
export const albumCategories = [...new Set(albums.map((album) => album.category))];
/** 音乐档案（一条 = 一首歌）；素材是否到位由生成期校验，这里只管数据形态。 */
export const musicTracks = lab.records.filter(
  (record): record is LabMusicSlot => record.kind === "music",
);
export function hrefForPost(postId: string): string | null {
  return hrefByPostId.get(postId) ?? null;
}
