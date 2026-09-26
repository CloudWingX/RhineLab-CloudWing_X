// 生成 `/lab/archives/` 下的档案下载件 —— 恢复上游 RhineLabUI 的「导出档案」。
//
// ── 背景 ────────────────────────────────────────────────────────────────
// 上游 RhineLabUI 里每个档案都有一份可下载的 TXT（`public/archives/RHINE-LAB-<id>.txt`，
// 由 `npm run export:archives` 生成，详情面板上的入口是 `EXPORT ↓`）。本基座把它换成了
// 「阅读全文」并删掉了那套生成脚本（`check-site.mjs` 里还留着一条"演示档案已退役"的断言）。
// 这里按本站三类档案**各自能下载什么**把它恢复：
//
//   · 文章档案 → `CLOUDWING-<槽位编号>.txt`  纯文本档案记录，版式照上游 archiveText
//   · 影像档案 → `<图集名>-images.zip`       该图集全部影像（ZIP，STORE 不压缩）+ 一份记录
//   · 音乐档案 → **不生成文件**：直接下载 `/lab/music/<id>.mp3`（本来就是静态素材）
//
// ── 两个设计决定 ────────────────────────────────────────────────────────
// 1. **ZIP 按"图集"生成，不按槽位。** 同一个图集在一列里会被补位成多个槽位
//    （见 docs/HANDOFF.md §3.1）；按槽位生成会把同一份影像重复打包好几遍（约 48MB），
//    按图集只有 5 个包、合计约 16MB。
// 2. **自己写 ZIP，不引依赖。** 影像本来就是 webp/jpg（已压缩），STORE（不压缩）就够 ——
//    于是几十行即可，不必为一个下载功能往仓库里加压缩库。CRC32 是 ZIP 格式要求的。
//
// 产物写在 `public/archives/`（与上游同址），随后由 `prepare-assets.mjs` 的白名单
// 暂存进 lab 的 publicDir，最终落在 `/lab/archives/`。该目录**整棵都是生成物**，不入库。
//
// 用法：node scripts/blog/export-archives.mjs
// ⚠️ 要在 `npm run generate:lab-content` 之后跑（本脚本读 `.generated/lab-content.json`）。

import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const generated = resolve(root, ".generated");
const output = resolve(root, "public/archives");
/** 影像素材的源目录（与 build-lab-content.mjs 校验时用的是同一个）。 */
const imageSource = resolve(root, "apps/blog/public");

// ── 档案记录 → 纯文本（版式照上游 archiveText，品牌换成本站）──────────────
function archiveText(record) {
  const lines = [
    "CLOUDWING · INTERNAL DATABASE",
    `FILE ${record.id} / ${record.title}`,
    record.en,
    "",
    `科室：${record.department}`,
    `编目范围：${record.date}`,
    `相关人物：${record.lead}`,
    `访问范围：${record.clearance}`,
    "",
    record.abstract,
    "",
  ];
  // 没有研究记录就整段省略，不要留一个空标题。
  if (record.findings.length) {
    lines.push("研究记录", ...record.findings.map((finding, i) => `${i + 1}. ${finding}`), "");
  }
  if (record.source) lines.push(`原文链接：${record.source}`, "");
  // BOM：记事本按 UTF-8 打开才不乱码（上游同样处理）。
  return `﻿${lines.join("\n").replace(/\n+$/, "")}\n`;
}

// ── 最小 ZIP（STORE，无压缩）────────────────────────────────────────────
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** MS-DOS 的日期时间（ZIP 头里用的那种）：秒只有 2 秒精度，年份从 1980 起。 */
function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: day };
}

/** entries: [{ name, data }]，顺序即包内顺序。 */
function zipStore(entries) {
  const { time, date } = dosDateTime(new Date());
  const parts = [];
  const central = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBytes = Buffer.from(name, "utf8");
    const crc = crc32(data);

    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0); // 局部文件头签名
    local.writeUInt16LE(20, 4); // 需要的解压版本
    local.writeUInt16LE(0x0800, 6); // 标志位：文件名是 UTF-8
    local.writeUInt16LE(0, 8); // 压缩方法：0 = 不压缩
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); // 压缩后大小
    local.writeUInt32LE(data.length, 22); // 原始大小
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28); // 扩展字段长度
    nameBytes.copy(local, 30);
    parts.push(local, data);

    const entry = Buffer.alloc(46 + nameBytes.length);
    entry.writeUInt32LE(0x02014b50, 0); // 中央目录条目签名
    entry.writeUInt16LE(20, 4); // 制作版本
    entry.writeUInt16LE(20, 6); // 需要的解压版本
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(0, 10);
    entry.writeUInt16LE(time, 12);
    entry.writeUInt16LE(date, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt16LE(0, 30); // 扩展字段
    entry.writeUInt16LE(0, 32); // 注释
    entry.writeUInt16LE(0, 34); // 起始磁盘
    entry.writeUInt16LE(0, 36); // 内部属性
    entry.writeUInt32LE(0, 38); // 外部属性
    entry.writeUInt32LE(offset, 42); // 局部头的偏移
    nameBytes.copy(entry, 46);
    central.push(entry);

    offset += local.length + data.length;
  }

  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // 中央目录结束记录
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...parts, centralBuffer, end]);
}

// ── 生成 ───────────────────────────────────────────────────────────────
const content = JSON.parse(await readFile(resolve(generated, "lab-content.json"), "utf8"));
const albumImages = content.albumImages ?? {};
const errors = [];

// 整棵重建：内容里删掉的槽位/图集不能把上一轮的下载件留在产物里。
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const articles = content.records.filter((record) => record.kind === "post");
for (const record of articles) {
  await writeFile(resolve(output, `CLOUDWING-${record.id}.txt`), archiveText(record), "utf8");
}

// 去重：同一个图集只打一个包（键就是它名字，与 albumImages 同源）。
let zipped = 0;
let zipBytes = 0;
for (const [albumKey, images] of Object.entries(albumImages)) {
  const entries = [];
  for (const image of images) {
    const file = resolve(imageSource, image.src.replace(/^\//, ""));
    try {
      entries.push({ name: basename(image.src), data: await readFile(file) });
    } catch {
      errors.push(`图集「${albumKey}」的影像不存在：${image.src}`);
    }
  }
  if (!entries.length) continue;
  // 包里附一份图集自己的档案记录，下载下来是自解释的。
  const slot = content.records.find(
    (record) => record.kind === "album" && record.albumKey === albumKey,
  );
  if (slot) entries.push({ name: `${albumKey}.txt`, data: Buffer.from(archiveText(slot), "utf8") });

  const archive = zipStore(entries);
  await writeFile(resolve(output, `${albumKey}-images.zip`), archive);
  zipped += 1;
  zipBytes += archive.length;
}

if (errors.length) {
  console.error(`档案导出失败：\n- ${errors.join("\n- ")}`);
  process.exit(1);
}

// 自检：产物目录里必须只有刚写的东西，且数量对得上（防止静默少写/多写）。
const written = (await readdir(output)).sort();
const expected = [
  ...articles.map((record) => `CLOUDWING-${record.id}.txt`),
  ...Object.keys(albumImages).map((albumKey) => `${albumKey}-images.zip`),
].sort();
if (written.join("\n") !== expected.join("\n")) {
  console.error(
    `档案导出产物与预期不符：\n  实际 ${written.length} 个 / 预期 ${expected.length} 个\n` +
      `  只在实际里：${written.filter((n) => !expected.includes(n)).join(" ") || "—"}\n` +
      `  只在预期里：${expected.filter((n) => !written.includes(n)).join(" ") || "—"}`,
  );
  process.exit(1);
}

console.log(
  `档案导出：文章 ${articles.length} 份 TXT + 图集 ${zipped} 个 ZIP（${(zipBytes / 1048576).toFixed(1)} MB）` +
    ` → ${output.replace(root + sep, "").replace(/\\/g, "/")}（音乐档案不生成文件，直接下载 mp3）`,
);
