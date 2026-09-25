import content from "../.generated/lab-content.json" with { type: "json" };

// 三维档案 adapter：读取构建时生成的公开内容目录，建立 postId -> href 索引，
// 并校验没有悬空引用。只读取公开文章摘要，不加载 Markdown 正文。
//
// 内容目录有两类档案：文章档案 records（进三维阵列，5 列 × 8 槽）与
// 影像档案 albums（图集，不进阵列，只从档案索引进入详情面板）。

export interface LabSlot {
  id: string;
  displayNumber: number;
  postId: string;
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
  href: string;
}

/** 影像档案（图集）里的一张影像。 */
export interface AlbumImage {
  src: string;
  title: string;
  date: string;
  aspect: string;
}

/**
 * 影像档案：一条记录对应一个**图集**（Minecraft / Peak / 黑暗之魂2 / AI生成 / 壁纸）。
 *
 * 与 LabSlot 的区别：影像档案**不进三维阵列**——没有槽位、不参与 columns 归属，
 * 因此没有 postId / href，也不产生第二份内容。所属"大类"
 * （`游戏影像` / `影像图集`）记在 category 上，只用于索引筛选与详情面板展示。
 */
export interface LabAlbum {
  id: string;
  kind: "album";
  displayNumber: number;
  title: string;
  en: string;
  department: string;
  category: string;
  count: number;
  dateFrom: string;
  dateTo: string;
  cover: string;
  images: AlbumImage[];
}

export interface LabContent {
  generatedAt: string;
  site: string;
  columns: string[];
  categories: string[];
  records: LabSlot[];
  albums: LabAlbum[];
}

const lab = content as LabContent;

const problems: string[] = [];
if (!Array.isArray(lab.columns) || lab.columns.length !== 5) {
  problems.push("columns 必须是 5 个策展主题");
}
if (!Array.isArray(lab.records)) problems.push("records 必须是数组");

const hrefByPostId = new Map<string, string>();
for (const record of lab.records) {
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
// 影像档案：不进三维阵列，所以单独校验——不要求 postId/href，但要求 id 唯一、
// 归入某个大类、images 非空且与 count 一致、每个 src 是站内绝对路径。
const albumCategorySet = new Set<string>();
const seenAlbumIds = new Set<string>();
if (!Array.isArray(lab.albums)) {
  problems.push("albums 必须是数组");
} else {
  for (const album of lab.albums) {
    if (!album.id || seenAlbumIds.has(album.id)) {
      problems.push(`影像档案 id 缺失或重复：${album.id}`);
    }
    seenAlbumIds.add(album.id);
    if (!album.category) problems.push(`影像档案 ${album.id} 缺少 category`);
    else albumCategorySet.add(album.category);
    if (!Array.isArray(album.images) || album.images.length === 0) {
      problems.push(`影像档案 ${album.id} 没有任何影像`);
      continue;
    }
    if (album.images.length !== album.count) {
      problems.push(
        `影像档案 ${album.id} 的 count=${album.count} 与 images=${album.images.length} 不符`,
      );
    }
    for (const image of album.images) {
      if (!image.src || !image.src.startsWith("/")) {
        problems.push(`影像档案 ${album.id} 的影像 src 必须是站内绝对路径：${image.src}`);
      }
    }
  }
  if (albumCategorySet.size === 0) problems.push("影像档案没有任何大类");
}

if (problems.length) {
  throw new Error(`lab 内容校验失败：\n- ${problems.join("\n- ")}`);
}

export const labContent = lab;
export const hasPosts = lab.records.length > 0;
export const albums = lab.albums;
export const albumCategories = [...albumCategorySet];
export function hrefForPost(postId: string): string | null {
  return hrefByPostId.get(postId) ?? null;
}
