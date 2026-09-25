// 旧站内容 → 本模板的内容契约
//
// 把 D:\deep seek workplace\endfield-blog 的 posts / changelog 迁进本仓库的
// content/posts、content/pages 与 content/lab-collections.json。
//
// ── 为什么是生成器而不是手抄 ──────────────────────────────────────────
// 26 篇内容 × 十来个字段，手抄既易错又不可复现；脚本让"旧内容 → 新契约"的映射集中在一处，
// 旧站内容改了重跑即可。
//
// ── 映射规则（对照 apps/blog/src/content/schema.mjs）────────────────────
//   id          post-<sha256(稳定种子) 前 12 位十六进制>  —— 满足 /^post-[0-9a-f-]{8,}$/
//               种子取"旧站的文件名"，标题或排序变了 id 也不变（schema 要求稳定身份）
//   title       原样
//   description 取旧 frontmatter 的 summary（实测 32–54 字，远低于 300 上限）
//   path        文章 → /<YYYY>/<MM>/<DD>/<slug>/   （slug = 旧文件名去掉开头的日期）
//               更新记录 → /log/<YYYY-MM-DD>/      （★必须与文章分开，否则日志类文章会同路径冲突★）
//   categories  旧 tags 含「站点日志」→ [站点日志]，否则 [技术]
//   tags        原 tags
//   legacyUrls  旧站地址（如 /posts/2026-09-19-rebuild-as-blog/）→ 供重定向生成器使用
//   publishedAt 旧 date + T00:00:00+08:00
//
// ── 更新记录为什么要变成文章 ──────────────────────────────────────────
// 本模板只有一种内容集合（posts）与 pages，没有 changelog 集合。旧站的 14 天更新记录
// （89 条改动）是实打实的正文内容，丢掉可惜；变成文章后能被列表、RSS、sitemap、搜索与
// 三维阵列一并收录，且**不需要扩展模板**。
//
// 用法：
//   node scripts/migrate-content.mjs --from "D:/deep seek workplace/endfield-blog" --dry-run
//   node scripts/migrate-content.mjs --from "D:/deep seek workplace/endfield-blog"

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const dry = argv.includes('--dry-run');
const FROM = arg('from');
const TO = resolve(arg('to', '.'));

if (!FROM || !existsSync(FROM)) {
  console.error('用法：node scripts/migrate-content.mjs --from <旧站根目录> [--to .] [--dry-run]');
  process.exit(2);
}

const idOf = (seed) => `post-${createHash('sha256').update(seed).digest('hex').slice(0, 12)}`;
const ymd = (iso) => { const [y, m, d] = iso.split('-'); return { y, m, d }; };
const clipper = (s, n = 300) => (s.length > n ? s.slice(0, n) : s);

function readMd(path) {
  const raw = readFileSync(path, 'utf8');
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!m) return { fm: '', body: raw.trim() };
  return { fm: m[1], body: m[2].trim() };
}
const unq = (s) => (s || '').trim().replace(/^['"]|['"]$/g, '');
const field = (fm, key) => { const m = fm.match(new RegExp(`^${key}:\\s*(.*)$`, 'm')); return m ? unq(m[1]) : ''; };
const tagsOf = (fm) => { const m = fm.match(/^tags:\s*\[(.*?)\]/m); return m ? m[1].split(',').map(unq).filter(Boolean) : []; };

// ── 读旧站 ──────────────────────────────────────────────────────────────
const oldPostsDir = join(FROM, 'src/content/posts');
const oldLogDir = join(FROM, 'src/content/changelog');
if (!existsSync(oldPostsDir)) { console.error(`✗ 找不到 ${oldPostsDir}`); process.exit(2); }

const outPosts = [];
const usedPaths = new Set();
const usedIds = new Set();

function push(entry) {
  if (usedIds.has(entry.id)) { console.error(`✗ id 冲突：${entry.id}`); process.exit(2); }
  if (usedPaths.has(entry.path)) { console.error(`✗ 路径冲突：${entry.path}`); process.exit(2); }
  usedIds.add(entry.id); usedPaths.add(entry.path);
  outPosts.push(entry);
}

// 1) 旧站文章
let postCount = 0;
for (const f of readdirSync(oldPostsDir).filter((n) => n.endsWith('.md')).sort()) {
  const { fm, body } = readMd(join(oldPostsDir, f));
  const date = field(fm, 'date');
  const title = field(fm, 'title');
  const summary = field(fm, 'summary');
  const tags = tagsOf(fm);
  const stem = f.replace(/\.md$/, '');
  const slug = stem.replace(/^\d{4}-\d{2}-\d{2}-/, '');
  const { y, m, d } = ymd(date);
  push({
    id: idOf(`endfield-post:${stem}`),
    title,
    description: clipper(summary || title),
    path: `/${y}/${m}/${d}/${slug}/`,
    publishedAt: `${date}T00:00:00+08:00`,
    categories: tags.includes('站点日志') ? ['站点日志'] : ['技术'],
    tags,
    legacyUrls: [`/posts/${stem}/`],
    body,
    origin: `posts/${f}`,
  });
  postCount += 1;
}

// 2) 旧站更新记录（14 天 → 14 篇文章，路径 /log/<date>/）
let logCount = 0;   // 覆盖的改动条数
let logDayCount = 0; // 生成的文章数（天）
for (const f of (existsSync(oldLogDir) ? readdirSync(oldLogDir) : []).filter((n) => n.endsWith('.md')).sort()) {
  const { fm, body } = readMd(join(oldLogDir, f));
  const date = field(fm, 'date');
  const src = fm || body;
  // items 在 frontmatter 里；最后一条常无结尾换行，故按 `- kind:` 位置切片而不是用大正则
  const marks = [...src.matchAll(/^[ \t]*-[ \t]*kind:[ \t]*(.+?)[ \t]*$/gm)];
  const items = marks.map((mm, i) => {
    const start = mm.index;
    const end = i + 1 < marks.length ? marks[i + 1].index : src.length;
    const block = src.slice(start, end);
    const t = block.match(/^[ \t]*title:[ \t]*(.+?)[ \t]*$/m);
    const n = block.match(/^[ \t]*note:[ \t]*(.+?)[ \t]*$/m);
    return { kind: unq(mm[1]), title: t ? unq(t[1]) : '', note: n ? unq(n[1]) : '' };
  }).filter((x) => x.title || x.note);
  if (!items.length) continue;
  const kinds = [...new Set(items.map((i) => i.kind))];
  push({
    id: idOf(`endfield-changelog:${date}`),
    title: `${date} 更新记录`,
    description: clipper(`当天共 ${items.length} 项改动，涵盖 ${kinds.join('、')}。`),
    path: `/log/${date}/`,
    publishedAt: `${date}T00:00:00+08:00`,
    categories: ['站点日志'],
    tags: ['changelog'],
    legacyUrls: [],
    body: [
      `本日共 ${items.length} 项改动。`,
      '',
      ...items.map((i) => `- **【${i.kind}】**${i.title}${i.note ? `：${i.note}` : ''}`),
    ].join('\n'),
    origin: `changelog/${f}`,
  });
  logCount += items.length;
  logDayCount += 1;
}

// 3) 独立页面：关于页（从旧站 site.ts 的 SITE 对象生成）
//    旧站的 /about/ 是 148 行 Astro 页面（含时间线/技能等排版结构），完整迁移需要把标记改写为
//    Markdown；这一版先搬**结构化的站点信息**（site.ts 是旧站唯一数据源），保证 /about/ 存在且内容真实。
//    ⚠️ 隐私红线（旧站 HANDOFF §12）：不得出现真实姓名/学校/企业名，作者身份统一 CloudWing_X。
const siteTs = readFileSync(join(FROM, 'src/site.ts'), 'utf8');
const sField = (k) => {
  const m = siteTs.match(new RegExp(`^\\s*${k}:\\s*'([^']*)'`, 'm')) || siteTs.match(new RegExp(`^\\s*${k}:\\s*"([^"]*)"`, 'm'));
  return m ? m[1] : '';
};
const SITE = {
  title: sField('title'),
  latin: sField('latin'),
  tagline: sField('tagline'),
  author: sField('author'),
  email: sField('email'),
  github: sField('github'),
  bilibili: sField('bilibili'),
  notice: sField('notice'),
  since: (siteTs.match(/^\s*since:\s*(\d{4})/m) || [])[1] || '',
};
const pages = [];
if (SITE.title) {
  pages.push({
    id: idOf('endfield-page:about'),
    title: '关于',
    description: `${SITE.title}（${SITE.latin}）：${SITE.notice || SITE.tagline}`.slice(0, 300),
    path: '/about/',
    publishedAt: `${SITE.since || '2025'}-12-05T00:00:00+08:00`,
    categories: [],
    tags: [],
    legacyUrls: ['/about/'],
    body: [
      SITE.tagline || `${SITE.title}（${SITE.latin}）`,
      '',
      '## 关于我',
      '',
      `${SITE.author}，计算机科学与技术本科在读。写 Java 后端，也做测试。`,
      '',
      '这里记录我做的项目、踩过的坑，和看到的值得记下来的东西。',
      '',
      '## 本站',
      '',
      `- 站名：${SITE.title}（${SITE.latin}）`,
      SITE.since ? `- 起站：${SITE.since} 年` : '',
      SITE.notice ? `- 说明：${SITE.notice}` : '',
      '',
      '## 联系',
      '',
      SITE.github ? `- GitHub：${SITE.github}` : '',
      SITE.bilibili ? `- Bilibili：${SITE.bilibili}` : '',
      SITE.email ? `- 邮箱：${SITE.email}` : '',
    ].filter((l) => l !== '').join('\n'),
    origin: 'site.ts → /about/',
  });
}

// 4) 影集：图片素材 + 图集数据
//    图片按旧站路径原样搬到 apps/blog/public/shots/<dir>/，因此数据里的 image 路径无需改写。
//    数据放在 content/gallery.json —— 与 content/lab-collections.json 同一约定：
//    "内容侧的唯一数据源"（三维档案系统只读它，条目不散落在代码里）。
//
//    ★大类归属是显式表，不从图集名字猜★：新增图集时必须在这里归类，否则报错退出，
//    避免新图集悄悄漏出档案系统。
const ALBUM_CATEGORIES = [
  { name: '游戏影像', albums: ['Minecraft', 'Peak', '黑暗之魂2'] },
  { name: '影像图集', albums: ['AI生成', '壁纸'] },
];

const oldShotsDir = join(FROM, 'src/content/shots');
const oldShotsPublic = join(FROM, 'public/shots');
const newShotsPublic = join(TO, 'apps/blog/public/shots');

const galleryItems = [];
if (existsSync(oldShotsDir)) {
  for (const f of readdirSync(oldShotsDir).filter((n) => n.endsWith('.md')).sort()) {
    const { fm } = readMd(join(oldShotsDir, f));
    const image = field(fm, 'image');
    if (!image) continue;
    galleryItems.push({
      title: field(fm, 'title'),
      game: field(fm, 'game') || '未分类',
      date: field(fm, 'date'),
      image,
      aspect: field(fm, 'aspect') || '16:9',
    });
  }
}
const games = [...new Set(galleryItems.map((i) => i.game))];

// 双向校验：每个图集恰好归属一个大类；大类里声明的图集必须真实存在。
if (galleryItems.length) {
  const classified = new Map();
  for (const category of ALBUM_CATEGORIES) {
    for (const album of category.albums) {
      if (classified.has(album)) {
        console.error(
          `✗ 图集「${album}」被归入多个大类：「${classified.get(album)}」与「${category.name}」`,
        );
        process.exit(1);
      }
      classified.set(album, category.name);
    }
  }
  const unclassified = games.filter((g) => !classified.has(g));
  if (unclassified.length) {
    console.error(`✗ 以下图集未在 ALBUM_CATEGORIES 中归类：${unclassified.join('、')}`);
    process.exit(1);
  }
  const phantom = [...classified.keys()].filter((album) => !games.includes(album));
  if (phantom.length) {
    console.error(`✗ ALBUM_CATEGORIES 声明了不存在的图集：${phantom.join('、')}`);
    process.exit(1);
  }
}

const gallery = {
  note: '图集数据源：由 scripts/migrate-content.mjs 从旧站 src/content/shots 生成。图片在 apps/blog/public/shots/。categories 是档案系统的两个大类，albums 的顺序即展示顺序。',
  categories: ALBUM_CATEGORIES.map((c) => ({ name: c.name, albums: [...c.albums] })),
  games,
  items: galleryItems,
};

// 5) 音乐：曲目数据 + 音频素材
//    旧站的曲目数据在 src/site.ts 的 MUSIC 数组里（唯一事实来源），音频/封面/歌词在 public/music/。
//    这里转成 content/music.json —— 与 lab-collections.json / gallery.json 同级，仍是
//    "内容侧唯一数据源"，/lab/ 的音乐播放器只读它。
//    ★歌词不进 JSON★：约定是 public/music/lyrics/<id>.lrc 存在即自动同步；少一个文件就自然
//    退化成"纯音乐"，不需要在数据里重复维护（也避免数据与文件两处打架）。
function parseMusic(source) {
  const at = source.indexOf('export const MUSIC');
  if (at < 0) return [];
  const open = source.indexOf('[', at);
  const close = source.indexOf('\n];', open);
  if (open < 0 || close < 0) return [];
  const body = source.slice(open + 1, close);
  const str = (chunk, key) => {
    const m =
      chunk.match(new RegExp(`${key}:\\s*'([^']*)'`)) ||
      chunk.match(new RegExp(`${key}:\\s*"([^"]*)"`));
    return m ? m[1] : '';
  };
  const num = (chunk, key) => {
    const m = chunk.match(new RegExp(`${key}:\\s*([\\d.]+)`));
    return m ? Number(m[1]) : undefined;
  };
  return body
    .split('{')
    .slice(1)
    .filter((chunk) => /id:\s*['"]/.test(chunk))
    .map((chunk) => ({
      id: str(chunk, 'id'),
      title: str(chunk, 'title'),
      artist: str(chunk, 'artist'),
      album: str(chunk, 'album'),
      src: str(chunk, 'src'),
      cover: str(chunk, 'cover'),
      instrumental: /instrumental:\s*true/.test(chunk),
      duration: num(chunk, 'duration'),
      sizeMB: num(chunk, 'sizeMB'),
      bitrate: num(chunk, 'bitrate'),
      origin: str(chunk, 'origin'),
    }));
}

const musicTracks = parseMusic(readFileSync(join(FROM, 'src/site.ts'), 'utf8'));
const oldMusicPublic = join(FROM, 'public/music');
const newMusicPublic = join(TO, 'public/music');

const music = {
  note: '曲目数据源：由 scripts/migrate-content.mjs 从旧站 src/site.ts 的 MUSIC 数组生成；音频、封面与歌词在 public/music/（歌词约定 lyrics/<id>.lrc 存在即自动同步）。',
  tracks: musicTracks,
};

// 双向校验：每条曲目的 src / cover 必须在旧站真实存在；纯音乐若带 lrc 就是数据自相矛盾。
if (musicTracks.length) {
  if (!existsSync(oldMusicPublic)) {
    console.error(`✗ 找不到 ${oldMusicPublic}`);
    process.exit(1);
  }
  for (const track of musicTracks) {
    for (const [key, value] of [['src', track.src], ['cover', track.cover]]) {
      const local = join(oldMusicPublic, String(value).replace(/^\/music\//, ''));
      if (!value || !existsSync(local)) {
        console.error(`✗ 曲目「${track.id}」的 ${key} 在旧站 public/music 里不存在：${value}`);
        process.exit(1);
      }
    }
    const lrc = join(oldMusicPublic, 'lyrics', `${track.id}.lrc`);
    if (track.instrumental && existsSync(lrc)) {
      console.error(`✗ 曲目「${track.id}」被标为纯音乐，却存在歌词 ${lrc} —— 两者矛盾`);
      process.exit(1);
    }
    if (!track.instrumental && !existsSync(lrc)) {
      console.warn(`  ⚠ 曲目「${track.id}」没有歌词文件（${lrc}），播放时歌词区会为空`);
    }
  }
}

// ── 序列化 ──────────────────────────────────────────────────────────────
const yamlArr = (arr) => `[${arr.map((s) => JSON.stringify(s)).join(', ')}]`;
function toMd(e) {
  const lines = [
    '---',
    `id: ${e.id}`,
    `title: ${JSON.stringify(e.title)}`,
    `description: ${JSON.stringify(e.description)}`,
    `path: ${e.path}`,
    `publishedAt: "${e.publishedAt}"`,
    'draft: false',
    `categories: ${yamlArr(e.categories)}`,
    `tags: ${yamlArr(e.tags)}`,
    `author: CloudWing_X`,
    `legacyUrls: ${yamlArr(e.legacyUrls)}`,
    '---',
    '',
    e.body,
    '',
  ];
  return lines.join('\n');
}

// ── 5 个策展主题（每主题最多 8 个槽位，可重复引用同一篇）──────────────────
// 表格即映射，改这里即可重排；槽位不满 8 时生成器会循环补位。
const themeOf = {
  技术笔记: (e) => e.categories.includes('技术'),
  建站日志: (e) => e.origin.startsWith('posts/') && e.categories.includes('站点日志'),
  更新档案: (e) => e.origin.startsWith('changelog/'),
  版本演进: (e) => e.origin.startsWith('changelog/') || e.categories.includes('站点日志'),
  归档总览: () => true,
};
const THEMES = [
  { name: '技术笔记', description: '开发、工具与踩坑记录' },
  { name: '建站日志', description: '站点迭代的逐日记录' },
  { name: '更新档案', description: '按日归档的改动明细' },
  { name: '版本演进', description: '日志与更新的时间线' },
  { name: '归档总览', description: '全部公开内容' },
];

const labCollections = {
  themes: THEMES.map((t) => ({
    name: t.name,
    description: t.description,
    postIds: outPosts.filter(themeOf[t.name]).slice(0, 8).map((e) => e.id),
  })),
};

// ── 写入 ────────────────────────────────────────────────────────────────
const postsOut = join(TO, 'content/posts');
const pagesOut = join(TO, 'content/pages');

console.log(`来源：${FROM}`);
console.log(`目标：${TO}`);
console.log(`  旧站文章 ${postCount} 篇 + 更新记录 ${logDayCount} 天（共 ${logCount} 条改动）→ new posts 合计 ${outPosts.length} 篇`);
console.log('');
console.log('  路径分布：');
for (const e of outPosts.slice(0, 4)) console.log(`    ${e.path}   ← ${e.origin}`);
console.log(`    …（共 ${outPosts.length} 篇）`);
console.log('');
console.log('  主题映射（每主题最多 8 个槽位）：');
for (const t of labCollections.themes) console.log(`    ${t.name}  ${t.postIds.length} 个引用  — ${t.description}`);
console.log('');
const empty = labCollections.themes.filter((t) => t.postIds.length === 0);
if (empty.length) { console.error(`✗ 有主题没有任何引用：${empty.map((t) => t.name).join('、')}`); process.exit(1); }

if (dry) { console.log('[DRY RUN] 未写入。'); process.exit(0); }

// 清掉模板的示例内容（它们与本站无关；保留会让站上混着示例文章）
const demo = [
  ...readdirSync(postsOut).filter((n) => n.endsWith('.md')).map((n) => join(postsOut, n)),
  ...(existsSync(pagesOut) ? readdirSync(pagesOut).filter((n) => n.endsWith('.md')).map((n) => join(pagesOut, n)) : []),
];
for (const p of demo) rmSync(p, { force: true });
console.log(`  已清掉模板示例内容 ${demo.length} 个文件`);

mkdirSync(postsOut, { recursive: true });
for (const e of outPosts) writeFileSync(join(postsOut, `${e.id}.md`), toMd(e), 'utf8');
if (pages.length) {
  mkdirSync(pagesOut, { recursive: true });
  for (const p of pages) writeFileSync(join(pagesOut, `${p.id}.md`), toMd(p), 'utf8');
}
writeFileSync(join(TO, 'content/lab-collections.json'), JSON.stringify(labCollections, null, 2) + '\n', 'utf8');
console.log(`✓ 已写入 ${outPosts.length} 篇文章 + ${pages.length} 个页面 + lab-collections.json`);

// 影集：搬图片 + 写数据
if (galleryItems.length && existsSync(oldShotsPublic)) {
  cpSync(oldShotsPublic, newShotsPublic, { recursive: true });
  writeFileSync(join(TO, 'content/gallery.json'), JSON.stringify(gallery, null, 2) + '\n', 'utf8');
  console.log(
    `✓ 已搬影集 ${galleryItems.length} 条 / ${games.length} 个图集 / ${gallery.categories.length} 个大类（图片 → apps/blog/public/shots/）`,
  );
  for (const category of gallery.categories) {
    const count = galleryItems.filter((i) => category.albums.includes(i.game)).length;
    console.log(`    [${category.name}] ${category.albums.join('、')} —— ${count} 张`);
  }
}

// 音乐：搬素材 + 写数据
if (musicTracks.length) {
  cpSync(oldMusicPublic, newMusicPublic, { recursive: true });
  writeFileSync(join(TO, 'content/music.json'), JSON.stringify(music, null, 2) + '\n', 'utf8');
  const withLyrics = musicTracks.filter((t) => !t.instrumental).length;
  console.log(`✓ 已搬曲目 ${musicTracks.length} 首（${withLyrics} 首有歌词 / ${musicTracks.length - withLyrics} 首纯音乐）（音频 → public/music/）`);
  for (const t of musicTracks) {
    console.log(`    ${t.id.padEnd(16)} ${String(t.duration ?? '?').padStart(7)}s  ${t.artist}`);
  }
}
