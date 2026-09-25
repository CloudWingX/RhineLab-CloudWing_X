// 品牌与站名替换（表驱动、幂等、可审计）
//
// ── 为什么需要它 ────────────────────────────────────────────────────────
// 本仓库是 JesseLee-CN/rhinelab-blog-theme（上游 LBEILC/RhineLabUI 的博客化衍生）的 fork。
// 它本身已做过一轮脱敏（作者写成 "Joyce"、站名写成"示例博客"、域名写成 example.com），
// 但仍保留了大量**上游的品牌字样**：RHINE LAB、POWERED BY RHINE LAB、莱茵生命 等。
// 本项目要换成站长自己的品牌：云翼 / CloudWing / CloudWing_X。
//
// ── 关键设计：改调用处，不动字形表 ──────────────────────────────────────
// `src/boot-lettering-art.json` 是**逐字母 SVG 字形**（11 条短语），`text` 必须与 `letters` 一一对应。
// `BootLettering.setText()` 的逻辑是 `phrases.find(p => p.text.startsWith(value))`：
//   · 若只改 JSON 的 text 而留着旧字形 → 会**匹配上**并画出旧字母形（视觉错误）；
//   · 若 JSON 保持不动而改调用处的字符串 → 匹配不上 → 渲染器走**已设计好的 plain-text 回退**
//     （源码注释："A new, unauthored phrase remains readable until its artwork is exported."），
//     新文案以普通文字正确显示。
// 所以本脚本**刻意跳过 boot-lettering-art.json**。字形与双环标志的重做按站长决定延后。
//
// ── 不动的内部标识符（既非用户可见、也无版权问题）──────────────────────
// `__RHINE_NOVECENTO__`、`vRhineTheme`、`RHINE_APPLY_UPDATE`（PWA 消息类型，改单边会断更新）。
//
// 用法：
//   node scripts/brand-transform.mjs --dry-run    # 先看影响
//   node scripts/brand-transform.mjs              # 实际写入
//   node scripts/brand-transform.mjs --check      # 只查残留（CI 用）

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, sep, extname } from 'node:path';

const ROOT = process.cwd();

// ★长串优先★（'RHINE LAB, LLC.' 必须早于 'RHINE LAB'，否则会被切成 'CLOUDWING, LLC.'）
export const TABLE = [
  // ── 三维入口的品牌名 ──
  ['RHINE LAB.LLC.', 'CLOUDWING'],
  ['RHINE LAB, LLC.', 'CLOUDWING'],
  ['POWERED BY RHINE LAB', 'POWERED BY CLOUDWING'],
  ['RHINE·LAB', 'CLOUDWING'],
  ['RHINE LAB', 'CLOUDWING'],
  ['Rhine Lab', 'CloudWing'],
  // ── 原 PV 的机构台词与默认文案（初始化 DOM 里的兜底值）──
  ['欢迎访问莱茵生命内部资料档案', '欢迎访问云翼内部资料档案'],
  ['>莱茵生命<', '>云翼<'],
  ['>机构档案<', '>学习<'], // 与新的第一个策展主题对齐
  // ── 署名 ──
  ['JOYCE MOORE', 'CLOUDWING_X'],
  ['JOYCE_MOORE', 'CLOUDWING_X'],
  // ── 博客层的站名、作者默认值、站点 origin ──
  ['示例博客', '云翼'],
  ['https://example.com', 'https://cloudwing.top'],
  ['default("Joyce")', 'default("CloudWing_X")'],
  ['Joyce ·', 'CloudWing_X ·'],
];

const ROOTS = ['src', 'apps/blog/src', 'shared', 'lab'];
// ⚠️ astro.config.mjs 必须显式列进来：站点 origin 在它里面（`BLOG_SITE_ORIGIN || "https://example.com"`），
// 漏了它会让 canonical / og:url / RSS / sitemap 全部指向 example.com —— 实测踩到过（产物里 22 个文件带 example.com）。
const ROOT_FILES = ['index.html', 'apps/blog/astro.config.mjs'];
const EXTS = new Set(['.ts', '.js', '.mjs', '.css', '.html', '.json', '.md', '.webmanifest', '.txt', '.astro']);

// ★字形表刻意跳过★（理由见文件头）
const SKIP = new Set(['src/boot-lettering-art.json']);
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.generated', '.astro']);

function walk(dir, base = ROOT, acc = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(full, base, acc); }
    else if (e.isFile()) acc.push(relative(base, full).split(sep).join('/'));
  }
  return acc;
}

function applyTable(text) {
  let out = text;
  const hits = {};
  for (const [from, to] of TABLE) {
    const n = out.split(from).length - 1;
    if (n > 0) { hits[from] = (hits[from] || 0) + n; out = out.split(from).join(to); }
  }
  return { out, hits };
}

const argv = process.argv.slice(2);
const dry = argv.includes('--dry-run');
const check = argv.includes('--check');

const files = [
  ...ROOTS.flatMap((r) => (existsSync(join(ROOT, r)) ? walk(join(ROOT, r)) : [])),
  ...ROOT_FILES.filter((f) => existsSync(join(ROOT, f))),
];

if (check) {
  let remaining = 0;
  const detail = {};
  for (const rel of files) {
    if (SKIP.has(rel) || !EXTS.has(extname(rel))) continue;
    const text = readFileSync(join(ROOT, rel), 'utf8');
    for (const [from] of TABLE) {
      const n = text.split(from).length - 1;
      if (n > 0) { remaining += n; detail[from] = (detail[from] || 0) + n; }
    }
  }
  if (remaining === 0) { console.log('✓ 无残留品牌字样'); process.exit(0); }
  console.log(`✗ 仍有 ${remaining} 处待替换：`);
  for (const [k, v] of Object.entries(detail)) console.log(`    ${k.padEnd(26)} × ${v}`);
  process.exit(1);
}

const changed = [];
const tally = {};
let scanned = 0;
for (const rel of files) {
  if (SKIP.has(rel) || !EXTS.has(extname(rel))) continue;
  scanned++;
  const abs = join(ROOT, rel);
  const text = readFileSync(abs, 'utf8');
  const { out, hits } = applyTable(text);
  if (out === text) continue;
  for (const [k, v] of Object.entries(hits)) tally[k] = (tally[k] || 0) + v;
  changed.push({ rel, hits });
  if (!dry) writeFileSync(abs, out, 'utf8');
}

console.log(`扫描 ${scanned} 个文本文件（跳过 ${[...SKIP].join(', ')}）${dry ? '  【DRY RUN，未写入】' : ''}`);
console.log('');
if (changed.length === 0) { console.log('✓ 无命中（已替换过，或表写错）'); process.exit(0); }
console.log(`命中 ${changed.length} 个文件：`);
for (const { rel, hits } of changed) {
  console.log(`  ${rel}`);
  console.log(`      ${Object.entries(hits).map(([k, v]) => `${k}×${v}`).join(', ')}`);
}
console.log('\n按模式汇总：');
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(26)} → × ${v}`);
}
