// 生成 Cloudflare Pages 的 _redirects（消费 legacyUrls）
//
// ── 为什么需要它 ────────────────────────────────────────────────────────
// 本模板的 schema 声明了 `legacyUrls`，docs/AUTHORING.md 也把它写成"用于生成一对一永久重定向"，
// 但**公开仓库里没有任何消费它的代码**：package-release.mjs 要求先跑 `npm run redirects` 生成
// `.generated/redirects/*.map`（nginx 用），而这条命令根本不存在。本脚本把这件事补上，
// 并直接产出 CF Pages 认的 `_redirects` 格式。
//
// ── 为什么必须做 ────────────────────────────────────────────────────────
// 新旧两站 URL 结构不同（旧 /posts/<日期-slug>/ vs 新 /<YYYY>/<MM>/<DD>/<slug>/）。
// 不做重定向，旧站被搜索引擎收录与被外部引用的所有文章地址会全部 404 —— 这是迁移最实际的损失。
//
// ── 三条校验（都是实测会踩的）──────────────────────────────────────────
//   1. **自指重定向**：某页的 legacyUrls 若包含它自己的 path，会生成 `<path> <path> 301` 死循环。
//      （本仓库的 /about/ 页就带 legacyUrls: ['/about/'] —— 因为旧站与本站都是 /about/。）
//   2. **重复的旧地址**：两篇内容声明同一个 legacyUrl，谁赢不确定 → 直接报错。
//   3. **不可盖住真实页面**：CF Pages 的 _redirects 优先于静态文件，若旧地址恰好是本站现有路径，
//      重定向会把真页面顶掉 → 直接报错。
//
// 用法：
//   node scripts/blog/build-redirects.mjs [--dist dist] [--dry-run]

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { load as parseYaml } from 'js-yaml';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const dry = argv.includes('--dry-run');
const root = resolve('.');
const DIST = resolve(arg('dist', 'dist'));

// 站级重定向：栏目地址（旧站是列表页，不挂在某篇内容上，所以不在 legacyUrls 里）。
// 只列**确定正确**的；尚未搬迁的栏目保持 404 并在下面注明，等功能落地再启用 ——
// 现在把它们 301 到首页只会制造"软 404"，反而掩盖"这个栏目还没搬"这件事。
// 站级规则：栏目地址（旧站是列表页，不挂在某篇内容上，所以不在 legacyUrls 里），
// 以及站点开屏的根路径。第三项是状态码，省略时按 301。
//
// ★200 与 301 的差别不只是语义★（CF Pages 的 _redirects）：
//   · 301 / 302 —— 规则**优先于**静态文件：命中就把请求转走，所以绝不能让它们盖住真页面。
//   · 200      —— 是 rewrite（用目标内容作答、地址栏不变），它**让位于**静态文件：
//                 请求路径上若真有文件，CF 直接给文件，rewrite 根本不生效。
// 两种情形下面都有校验，撞上了直接构建失败。
const SITE_REDIRECTS = [
  // 站点开屏即三维终端：根路径用 rewrite 直接给 /lab/，地址栏保持 `/`（站长选定的形态）。
  // 博客首页因此搬到了 /blog/ —— 三维终端设置里的「BLOG HOME」入口指的就是它。
  ['/', '/lab/', 200],
  // 旧站 /posts/ 是文章列表 → 新站的时间线归档页
  ['/posts/', '/archive/'],
  // 旧站 /log/ 是 changelog 全展开 → 新站的归档页（更新记录已变成 /log/<日期>/ 的文章）
  ['/log/', '/archive/'],
  // 旧站 /rss.xml /about/ /blog/ 与本站同路径，无需重定向；
  // 旧站的 /account/（互动页）对应的功能已砍掉，新站没有这个页面 → 让它 404（站长 2026-09-26 定）。
];
const PENDING = [
  // 下面两个栏目**已经搬进 `/lab/` 阵列**（影像档案 / 音乐档案），但**旧地址的处置还没定**：
  // 指到 `/lab/` 还是保持 404，取决于站长的决定。定下来之前不写规则。
  ['/gallery/', '画廊已搬入 /lab/ 阵列，旧地址待定'],
  ['/music/', '音乐已搬入 /lab/ 阵列，旧地址待定'],
  // 下面这个还没搬，等页面落地再启用。
  // （/calendar/ 已于 2026-09-26 落地，与旧站同路径，因此不需要重定向。）
  ['/nav/', '站点导航目录尚未搬迁'],
];

// ── 读内容 frontmatter ─────────────────────────────────────────────────
function collect(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => n.endsWith('.md')).sort().map((n) => {
    const raw = readFileSync(join(dir, n), 'utf8');
    const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
    const fm = m ? (parseYaml(m[1]) ?? {}) : {};
    return { file: n, path: fm.path, legacyUrls: Array.isArray(fm.legacyUrls) ? fm.legacyUrls : [] };
  });
}
const items = [...collect(join(root, 'content/posts')), ...collect(join(root, 'content/pages'))];

// ── 组装规则 ───────────────────────────────────────────────────────────
const errors = [];
const warnings = [];   // 例如自指重定向：页面 URL 没变（旧站与本站都是 /about/），不是错误，跳过即可
const rules = [];
const seen = new Map();       // 旧地址 → 目标（查重）
const targets = new Set();

function add(from, to, note, status = 301) {
  if (status !== 200 && status !== 301 && status !== 302) {
    errors.push(`不支持的状态码 ${status}：${from} → ${to}（${note}）`); return;
  }
  // 自指：页面 URL 与旧地址相同 → 无需重定向（跳首页那种全站跳转反而会掩盖真实 404）
  if (from === to) { warnings.push(`跳过自指：${from}（${note} —— 该页 URL 未变，无需重定向）`); return; }
  if (seen.has(from)) { errors.push(`旧地址重复声明：${from}（${seen.get(from)} 与 ${note} 都要它）`); return; }
  if (from.startsWith('//') || from.includes('..')) { errors.push(`非法旧地址：${from}（${note}）`); return; }
  seen.set(from, note);
  rules.push([from, to, note, status]);
}

// 真实存在的静态页面：重定向不能盖住它们
function existsInDist(p) {
  if (!existsSync(DIST)) return false;
  if (p === '/') return existsSync(join(DIST, 'index.html'));
  const rel = p.replace(/^\//, '');
  const asFile = join(DIST, rel);
  return existsSync(join(DIST, rel, 'index.html')) || (existsSync(asFile) && statSync(asFile).isFile());
}

for (const it of items) {
  if (!it.path) continue;
  targets.add(it.path);
  for (const legacy of it.legacyUrls) add(legacy, it.path, it.file);
}
for (const [from, to, status] of SITE_REDIRECTS) add(from, to, '站级栏目', status);

// 校验：不可盖住真实页面。
// ⚠️ 条件必须是 `from !== to`，不能写成 `!targets.has(from)` —— 后者会放行"旧地址恰好是
// 另一篇内容的 path"这种情况（实测踩到：把 /about/ 写成某篇文章的旧地址时被放行，
// 生成 `/about/ → /2025/12/08/log/`，把真实的关于页顶掉）。
// 判据是"这个旧地址在产物里已经是真页面" → 任何指向别处的重定向都会让它不可达。
if (existsSync(DIST)) {
  for (const [from, to, note, status] of rules) {
    if (from === to || !existsInDist(from)) continue;
    errors.push(
      status === 200
        ? `重写 ${from} → ${to} 不会生效：${from} 在产物里已经是真文件，而 200 让位于静态文件（来源：${note}）`
        : `旧地址 ${from} 已是本站现有页面，重定向到 ${to} 会让它不可达（来源：${note}）`,
    );
  }
}

if (errors.length) {
  console.error(`✗ 重定向校验失败：\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

// ── 输出 ───────────────────────────────────────────────────────────────
const header = [
  '# Cloudflare Pages 重定向表（由 scripts/blog/build-redirects.mjs 生成，请勿手改）',
  '#',
  '# 来源：content/{posts,pages}/*.md 的 legacyUrls + 脚本内的站级栏目表。',
  '# 说明：301/302 优先于静态文件、200 让位于静态文件 —— 两种情形构建时都会校验是否撞上现有文件。',
  '# 状态码见每行末列：301 = 永久重定向；200 = rewrite（用目标内容作答，地址栏不变）。',
  '#',
  `# 规则数：${rules.length}（其中站级 ${SITE_REDIRECTS.length}）`,
  '#',
  '# 暂不重定向的栏目（原因见各行；现在一律 301 到首页只会制造软 404，反而掩盖真实状态）：',
  ...PENDING.map(([p, why]) => `#   ${p.padEnd(12)} ${why}`),
  '#',
].join('\n');

const body = rules.map(([from, to, , status]) => `${from} ${to} ${status}`).join('\n');

const outPath = join(DIST, '_redirects');

if (dry) {
  console.log(header);
  console.log(body || '（无规则）');
  process.exit(0);
}

if (!existsSync(DIST)) {
  console.error(`✗ 产物目录不存在：${DIST}（请先跑构建）`);
  process.exit(1);
}
mkdirSync(DIST, { recursive: true });
writeFileSync(outPath, `${header}\n${body}\n`, 'utf8');

console.log(`重定向生成：${rules.length} 条规则 → ${outPath}`);
console.log(`  来自 legacyUrls：${rules.length - SITE_REDIRECTS.length} 条（覆盖 ${targets.size} 个内容路径）`);
console.log(`  站级栏目：${SITE_REDIRECTS.length} 条`);
for (const [from, to, status = 301] of SITE_REDIRECTS) console.log(`    ${from.padEnd(12)} → ${to.padEnd(10)} ${status}`);
if (warnings.length) { console.log('  跳过：'); for (const w of warnings) console.log(`    ${w}`); }
console.log(`  暂不重定向：${PENDING.map(([p]) => p).join(' ')}`);
