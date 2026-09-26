# 交接记录（截至 2026-09-26 深夜）

> 这份是**接手入口**：先读它，再按需读 [FEATURES.md](FEATURES.md)（模块边界）、
> [BUILD.md](BUILD.md)（构建与部署）、[UPSTREAM.md](UPSTREAM.md)（与上游的关系）。
> 各功能的专项说明在 [READER.md](READER.md) / [ALBUM.md](ALBUM.md) / [MUSIC.md](MUSIC.md)。

## 1. 一句话现状

旧站 `endfield-blog` 的**内容已全部迁入**、**五个功能已全部搬完**；
本仓库（新基座）**本地构建全绿、本地预览可用**；
**已于 2026-09-26 首次部署到 Cloudflare Pages** → `https://www.cloudwing.top`（见 §4.3）。

## 2. 仓库、分支与远程

| 对象 | 位置 | 说明 |
| --- | --- | --- |
| **新站实施现场** | 本仓库，分支 `migration/cloudwing` | 相对上游 `007313b` 的提交清单见 §3 / §3.1 |
| **本站仓库（origin）** | `github.com/CloudWingX/CloudWing_X` | ★**必须保持私有**★ —— 仓库里有 132 张游戏截图、4 首商业 mp3（约 42MB）、21 个商标图标，都是构建必需的输入 |
| 上游模板（upstream） | `github.com/JesseLee-CN/rhinelab-blog-theme` | ⚠️ 它的 **push 地址已被改成 `DISABLED_UPSTREAM_IS_READ_ONLY`**（照模板的 `ops/setup-remotes.sh`），物理上推不上去 |
| 旧站（内容来源） | `D:\deep seek workplace\endfield-blog` | **只读**，不修改 |
| 已放弃的旧基座尝试 | `cloudwing-terminal/` | 13 个提交留作对照，**不要再推进** |

远程**已经配好**（`origin` = 本站仓库、`upstream` = 上游模板且 push 被禁用），
要推送只需在仓库根**双击 `推送代码.cmd`**（或跑 `git push -u origin migration/cloudwing`）。

## 3. 已完成（下表为上一轮的功能提交，从新到旧；本轮的提交见 §3.1 / §3.2）

| 提交 | 做了什么 |
| --- | --- |
| `5f190fd` | 预览端口被占用时自动顺延（不再抛 EADDRINUSE 栈） |
| `83929bc` | **音乐改成阵列里的一列档案**（一条 = 一首歌），撤掉独立 MUSIC 按钮 |
| `db836ea` | 音乐播放器（黑胶 / LRC 歌词 / 播放参数）+ **修功能浮层的舞台缩放** |
| `216c95f` | **影像档案改成阵列里的两列**，并修掉两个被暴露的隐含假设 |
| `e3a3cbb` | 修 `check-features` 把仓库路径里的空格变成 `%20`（模板 bug） |
| `bbc59b9` | 修 Windows 上 `spawn("npm.cmd")` 必抛 EINVAL（模板 bug） |
| `5d7d928` | `.cmd` 用 CRLF 行尾（cmd.exe 对纯 LF 批处理支持很差） |
| `82db61d` | 新增影像档案（图集）与查看器，接通两个大类 |
| `0e698a9` | 补双击本地预览脚本 `打开预览.cmd`，`preview` 支持 `--open` |
| `20f4597` | 补模板缺失的重定向生成器，接通 `legacyUrls` |
| `6007d17` | 旧站内容迁入（26 篇文章 + `/about/` + 5 个策展主题） |
| `596a749` | Cloudflare Pages 接线 + 修正 build 脚本缺失的生成步骤 |
| `dd3e596` | 品牌与站名替换（表驱动、幂等、可审计） |
| `190a061` | 按 `docs/FEATURES.md` §4 移除「身份门 / 登录注册」功能 |

**内容基数**：26 篇文章（12 篇旧文 + 14 天更新记录）、1 个页面（`/about/`）、5 个策展主题、
**132 张影像**（进阵列的两列）、**4 首曲目**（进阵列的一列）。

### 3.1 本轮修订（2026-09-26，4 个提交）

提交：`212747b`（取景原点）→ `c4881ca`（每列 8 槽）→ `fe9f822`（详情版式）→ 随后的本次文档同步。

按「三维档案的样式要忠于模板」修了三处，全部落在前面那两个新功能上：

1. **三维阵列取景错位（真 bug）** —— `src/scene.ts` 的实例排布仍写死 `(lane - 2)`，而 `cellPosition`
   / `trackPosition` / `center.lane` 已改用 `LANE_CENTER = (CONTENT_COLUMNS - 1) / 2 = 3.5`：
   阵列实例与"被抽出的模型"整体错位 **1.5 列（7.8 世界单位）**，开场（`cinematic`）镜位锚定在模型上，
   所以整段开场也偏 1.5 列。模板的坐标原点本来就是**参考阵列（原片 5 列）的中心 = 2**，
   `(C-1)/2` 只有在 C=5 时才等于 2，这次改写等于把原点带偏了。
   → `archive-loop.ts` 新增 `REFERENCE_COLUMNS = 5`，`LANE_CENTER = 2`（**不再由列数推导**）；
   `scene.ts` 6 处泳道坐标（含实例排布）统一读它；`i >= 160` 写成 `REFERENCE_COLUMNS * LOOP_ROWS`。
2. **每列槽位数不均** —— 模板的 `SLOTS_PER_THEME = 8` 会循环补位，所以**每列恰好 8 槽**；
   新列没走这条规则（游戏影像 3 / 影像图集 2 / 音乐 4，而 2/3 与行周期 32 不整除）。
   → `build-lab-content.mjs` 对影像/音乐同规则补位：**每列 8 槽、共 64 条**。
   ★图片不复制 8 遍★：产物顶层新增 `albumImages`（按 `albumKey` 索引，132 条只存一份），
   槽位只带 `albumKey`；`blog-adapter.ts` 读入后把**同一份数组引用**挂到每个槽位
   （否则 132 条会膨胀到 413 条、首屏约 +42KB；实测 JSON 57KB → 66KB）。
3. **详情面板与模板不一致** —— `renderAlbumDetail` / `renderMusicDetail` 把摘要放进了一个裸 `<p>`，
   而它不在 `.tab-panel` 内（`style.css` 里唯一的段落规则是 `.tab-panel p`，15px / 行高 1.95 / 两端对齐），
   于是掉回浏览器默认排版；面板也没有模板的 01/02/03 页签与下划线。
   → 两套模板合并进 `renderDetail`：三类档案**共用同一版式**（kicker / 标题 / 元数据 / 三页签 /
   操作区 / 脚注），只有元数据字段、页签标签与正文、操作按钮按 `kind` 分叉；恢复左下 `.object-caption`
   的 `NO.xxx`（隐藏依赖三维模型的 DRAG TO INSPECT / 360° 两项）。

**本轮验证（沙箱内可做的部分）**：`tsc --noEmit` **0 报错**；`check:features`、`check:content` 通过；
生成器重跑输出「每列 8 槽 / 64 条」；17 条断言全过（原点 = 2、无写死原点、每列 8 槽、8 \| 32、
同一图集共享 `images` 引用、总数仍是 132、页签结构就位）。**`npm run build` 与浏览器目视未做**（见 §6）。

### 3.2 站点入口改成三维终端（2026-09-26）

站长定：**开屏直接进三维终端**，博客首页搬进 `/blog/`，终端设置里给一个回博客的入口。

- `apps/blog/src/pages/index.astro` → `pages/blog/index.astro`（博客首页 = `/blog/`）。
- `_redirects` 加站级规则 **`/ /lab/ 200`** —— ★200 是 rewrite：用终端的内容作答、**地址栏保持 `/`**★，
  不是 301。生成器 `build-redirects.mjs` 因此支持逐条状态码（原来写死 301）。
- 引导链接改到 `/blog/`：`BaseLayout` 的站名、`404.astro`、终端的 `<noscript>`。
- 三维终端设置弹框底部加 `BLOG HOME`（`data-action="blog-home"` → `location.assign("/blog/")`）。
  ★它必须与 `_redirects` 的规则同源★ —— `src/main.ts` 里 `BLOG_HOME` 的注释写明了这点。
- `check-site.mjs`：`/` 的断言改到 `blog/index.html`，并**新增守卫**：`dist/index.html` 不得存在
  （200 让位于静态文件，有文件 rewrite 就不生效）。
- `preview.mjs`：**新增 `_redirects` 支持** —— 此前它根本不读，本地访问 `/` 会 404，
  而它自称"与线上一致"。顺带删掉 auth 时代遗留的 `/api/auth/*` 假响应（上一轮清残留漏掉的代码路径）。
- 内容契约：`RESERVED_PATH_PREFIXES` 加 `/blog`，防止内容的 `path` 撞上首页路由。
- **实测（沙箱）**：`build-redirects` 在 `dist/index.html` 存在时**按预期失败**（守卫说明写对了），
  移开后生成 `/ /lab/ 200`；`preview` 下 `/` → 200 且是终端、`/posts/` 与 `/log/` → 301。
  ⚠️ 版本渲染、入口是否真的进终端，仍需真机确认（见 §5）。

### 3.3 §3.2 搬家带出的相对导入（2026-09-26）

§3.2 的搬家把首页的相对导入弄断了一级（`pages/` → `pages/blog/` 之后，`../layouts/` 得写成
`../../layouts/`），`astro build` 在 `build:blog` 直接 `UNRESOLVED_IMPORT` 失败 —— **实测踩到**。

- 修复：`blog/index.astro` 的两处导入各退一级（`dfaf6af`）。
- **新增门禁** `scripts/blog/check-imports.mjs`（`npm run check:imports`）：静态解析 `src/` 与
  `apps/blog/src` 下全部相对导入（实测 118 条），已接进 `npm run typecheck` 与统一构建链的**第一步**。
  ★为什么非加不可★：这类错误 **`tsc` 抓不到** —— 根 `tsconfig.json` 的 include 只有 `src` 与
  `shared/reading`，`apps/blog` 整个不在里面；而 `astro build` 只能在装了 Windows 原生二进制的
  机器上跑。门禁是纯 JS，任何平台都能提前抓出来。
- 反证：把导入改回错的一级，门禁精确报出
  `apps/blog/src/pages/blog/index.astro → ../layouts/BaseLayout.astro`，退出码非 0。
- 顺带更正：BUILD.md §2 之前写"六步"且漏登记了 `build:redirects` —— 构建链其实早就是七步，现在是八步。

### 3.4 修复：档案下载缺失、影集/曲目不能收藏、收藏重复（2026-09-26）

站长报的三个 bug，根因集中在两处：本基座把上游的「导出档案」换成了「阅读全文」，
而**收藏的键**在内容迁移时从槽位编号被改成了文章 id。

1. **档案下载没了** —— 上游 RhineLabUI 每个档案一份可下载的 TXT
   （`public/archives/RHINE-LAB-<id>.txt`，`npm run export:archives` 生成，详情面板 `EXPORT ↓`）。
   本基座把它换成「阅读全文」并删掉了生成脚本（`check-site.mjs` 里还留着"演示档案已退役"的断言）。
   → 新增 `scripts/blog/export-archives.mjs`：文章槽位各一份 `CLOUDWING-<id>.txt`（版式照上游
   `archiveText`）、去重后的图集各一个 `<图集名>-images.zip`（**自写的 STORE ZIP** —— 仓库里没有
   压缩库，而影像本来就是已压缩的 webp/jpg；包内含影像 + 一份图集记录）、音乐档案直接下 mp3。
   ★ZIP 按图集而不是按槽位★：一个图集占多个槽位，按槽位打包会重复好几遍（约 48MB → 15.9MB）。
2. **影集/曲目不能收藏** —— 详情操作区只给了它们各自的操作按钮，而 `saved` 按 `postId` 存，
   对它们恒为空串。→ 三类都补上收藏（文案按 kind：收藏文章 / 收藏影像 / 收藏曲目）。
3. **收藏一个档案却出现多份** —— 仍是按 `postId` 存所致：**一篇文章在阵列里占多个槽位**
   （实测 11 篇各占 2–4 个），收藏页就把每个槽位都列一遍。上游本来就是按**槽位编号**存的
   （`saved.has(r.id)`）→ 改回槽位编号，并对旧的 postId 值做了一次迁移。

**沙箱验证**：`tsc` 0 报错，`check:imports` / `check:content` / `check:features` 通过；
导出产物 **45 个文件（40 TXT + 5 ZIP，15.9 MB）**，5 个 ZIP 全部通过 python `zipfile` 的 CRC 校验；
把详情面板会生成的 **64 个下载 URL 逐个落地核对、0 失败**；`prepare:assets` 实测把 45 个文件
暂存进了 `.generated/lab-public/archives/`。⚠️ 浏览器里真的点下载、以及三项收藏行为，仍需真机确认。

**顺带对齐**：`build-lab-content.mjs` 的 origin 默认值原本是 `example.com`，而站点与
`astro.config.mjs` 的默认是站点 origin —— 导出的 TXT 里"原文链接"因此指向 example.com，已改齐。
  （2026-09-26 末：**本站住在 `www.cloudwing.top`** —— apex `cloudwing.top` 上是**旧站**，
  **两个站并存**、不接管 apex（站长定）。四处 origin 默认值已改成 `https://www.cloudwing.top`。
  ★第一版线上部署的 canonical 指向了 `cloudwing.top`（= 旧站），已在 §4 记录并修正★。）

### 3.5 日历页落地（2026-09-26）

旧站 `/calendar/` 的「记录 · 日历」搬过来了，**只做月历**（不做侧栏倒计时，站长定）。
路径与旧站同 → 不需要重定向。详见 [CALENDAR.md](CALENDAR.md)，要点：

- **★农历换算改成自写★**：旧站依赖的 `js-calendar-converter` 是 **GPL-3.0-or-later**，而本仓库是
  MIT 模板 —— 不能把 GPL 拉进依赖图。改成"自写算法（`apps/blog/src/lib/lunar.ts`）+ 一张只含
  天文事实的年表（`lunar-table.json`）"；年表从那份实现的**输出**里一次性导出
  （`verification/gen-lunar-table.cjs`），**那份 GPL 实现只在本机临时借用，不进任何依赖**。
- **★逐日对拍★**（`verification/diff-lunar.mjs`）：判据是日历格子上真正显示的两个值
  （标签 + 种类），覆盖 **73058 天（1900-01-31 ~ 2100-02-08）· 0 不一致**。
  它抓到过两个真 bug：「初十」写成「十」、年表最后一年被截断 —— 没对拍这两个就上线了。
- 窗口从旧站的写死 2025–2027 改成**构建年 −1 ~ +2**（自动跟随）；年表真实覆盖农历年
  1900–2099，界外 `solarToLunar` 返回 `null` 而不猜（组装层撞上直接抛错，不静默画错）。
- 每年要改的只有一处：`content/calendar.json`（法定节假日与调休，gov.cn 口径）。
- 顶栏加「日历」一项；`check-site` 的 requiredFiles 加 `calendar/index.html`；
  `build-redirects` 的 PENDING 去掉 `/calendar/`。
- **砍评论**：`account.astro` 删除、sitemap 不再排除 `/account/`、`blog.css` 删掉 account 段
  （173 行）、`BaseLayout` 里那段账号注释删掉。

⚠️ 月历外观与翻月手感需真机目视。

### 3.6 网站导航进三维阵列（2026-09-26）

旧站 `/nav/` 的网站导航搬过来了。★形态改过一版★：最初做成"每个分组一列"（阵列 14 列），
站长指出**那是错的** —— 要的是「网站导航」作为**一个大类占一列**，列里的每条档案才是分组
（与影像档案完全同构）。现在是 **9 列**。详见 [NAV.md](NAV.md)，要点：

- `content/nav.json`（6 分组 / 21 条目）→ 生成器并入 `records`（`kind: "siteGroup"`）与 `columns`；
  每列仍**恰好 8 槽** → 网站导航列 8 条档案（6 个分组循环补位）。总档案 72 条。
- **新增功能模块 `src/features/site-viewer/`**（第 4 个）：与 album-viewer 同构的浮层 ——
  宿主端口 + 门面 + 懒加载，卡片墙列出分组里的站点，每张卡是外链（新标签 + `noopener`）。
  退出动效有 600ms 兜底（与影像查看器同因）。
- 图标**自托管**（`apps/blog/public/nav/`，21 个 / 108 KB），**不发任何外部请求**；
  生成期 `stat` 每个图标 —— 缺文件直接构建失败（否则只是浮层里的一个破图标，最难被发现）。
  浮层里**图标与首字互斥**（有图标就不在 DOM 里留首字，否则会在图标透明处透出来）。
- 详情面板走同一版式：`[收藏][浏览站点]`（与影像档案的 `[收藏][查看详情]` 同构）、
  第二页签「收录站点」与「收录影像」同版式。
- 旧地址：`/gallery/`、`/music/`、`/nav/` **一律 301 到 `/lab/`**（站长定），PENDING 清空。

⚠️ 第 9 列的构图与浮层卡片墙的排布需真机目视。

## 4. 未完成

1. **功能全部搬完**（旧站 13 条路由对照）：农历日历 → §3.5、网站导航 → §3.6、
   giscus 评论**已砍掉**（站长定，减负 —— `account.astro` 占位页与它那 173 行 CSS 一并删除，
   旧站的 `/account/` 随之 404）。
2. ~~两个旧 URL 的处置未定~~ —— **已定**（2026-09-26）：`/gallery/`、`/music/`、`/nav/`
   三个旧地址一律 **301 到 `/lab/`**（它们现在都是阵列里的列）。`build-redirects.mjs` 里的
   `PENDING` 清单因此清空。
3. **已首次部署（2026-09-26）** → `https://www.cloudwing.top`（CF Pages，Git 集成）。
   完整操作与核对清单见 [DEPLOY-CF.md](DEPLOY-CF.md)。★还剩一步没做★：
   **CF 环境变量里要设 `BLOG_SITE_ORIGIN=https://www.cloudwing.top` 并重新部署** —— 第一版线上
   部署的 canonical / og:url 指向了 `https://cloudwing.top`（= **旧站**的地址），等于让新站每页
   声明"正本是旧站那一页"；四处 origin 默认值已修（见 §3.4 末），但线上要重新构建才生效。
   ⚠️ **本站住在 `www`、apex 是旧站，两个站并存**（站长定）；并存期间新站文章与旧站的同名文章
   构成重复内容，彻底解决要等旧站下线或整体 301。
   ⚠️ 另记一个实测坑：CF Pages 建项目**必须选 Pages 不是 Workers**（Workers 会跑
   `npx wrangler deploy`，在 npm workspace 根目录报"application detection"失败）——见
   DEPLOY-CF.md §1.9。
4. **延后项**：双环标志与开场字形表的重做（站长定"等网页完成后再说"）。

## 5. ⚠️ 待真机确认（沙箱里验不了的两处）

这两件事**必须有真实浏览器**才能确认，交接时它们的状态是"已实现但未验证"：

1. **音频能不能真的响**。沙箱里无头 Chrome 的媒体元素表现不一致：同一页面里内联写一遍同样的
   Blob 播放流程能播、时钟正常推进，但播放器里的元素始终 `readyState=0`。**无法判定是环境还是代码**。
   → 真机上打开一首歌的档案详情、点「播放」；不响的话看浮层左下角的状态文案（它现在会显示失败原因）。
2. **三维阵列 9 列的外观**（5 文章主题 + 2 影像大类 + 音乐 + 网站导航）。页面持续跑 rAF
   动画，截图会卡死，所以只能目视。★跟这项一起看★：站点目录浮层（`[收藏][浏览站点]` 打开）
   的卡片墙排布、图标有没有破图、外链是不是新标签打开。
   ★**先看这一项**★：第 8 列（音乐）加进来后，`LANE_CENTER` 曾被改成 3.5、与实例排布里写死的 2
   冲突，阵列与抽出的模型错位 1.5 列 —— 已在 §3.1 修掉，但**修完仍需目视确认**：
   选中的档案卡片要正好落在抽出的模型下方居中；左右切列时整个阵列平移，边缘不应跳。
   另外确认每列刻度条都是 **8 个**（`#file-ticks`）。

## 6. 构建与验证

```bash
npm ci                # 首次；仓库里没有 node_modules（不进 git）
npm run build         # 统一构建，八步链
npm run preview -- --open   # 预览真实产物 dist/
```
或者**双击仓库根的 `打开预览.cmd`**（构建 + 预览 + 开浏览器）；端口被占用时会自动顺延。

八步链：`check:imports → check:content → check:features → build:blog → build:lab → build:redirects → search:index → check:site`

**当前验证状态（提交态）**（2026-09-26 深夜，Linux 侧）：`typecheck` 0 报错、`check:features` 通过
（4 个功能：reader / album-viewer / music-player / site-viewer）、`npm run build` **exit 0**、
`check:site` 通过、dist 46 页。

**本轮修订（§3.1，已提交）的验证状态**：`tsc --noEmit` **0 报错**、`check:features` / `check:content`
通过、生成器断言 17 条全过。★**`npm run build` 没跑**★ —— 一轮沙箱侧磁盘被别的会话占满（`/tmp` 里
`cft` / `rl` / `cwbase` / `serve` 共约 1.6GB，属主是 `nobody`，无 sudo 删不掉、无法 `npm ci`），
且仓库里的 `node_modules` 是 Windows 装的、不能在 Linux 上用来构建。
→ **接手后请在 Windows 侧跑一次 `npm run build`（或双击 `打开预览.cmd`）并完成 §5 的目视。**

**模块化纪律**：`src/features/` 下的功能靠"宿主端口 + 门面"接核心，改完必须跑
`npm run check:features`（它会抓出清单不一致、跨功能穿透、孤儿文件 —— 本轮它真的抓到过一次）。

## 7. 环境约束（都是实测踩出来的）

- **不能在 Windows 上直接 `spawn("npm.cmd")`**：Node ≥ 20.12/21.7/22 会抛 EINVAL，
  症状极具迷惑性（第一步就"失败"、子进程根本没起来）。已在 `build-site.mjs` 修好。
- **`.cmd` 必须 CRLF**：cmd.exe 对纯 LF 的批处理支持很差。已加 `.gitattributes` 规则
  `*.cmd text eol=crlf`。
- **仓库路径含空格**（`D:\deep seek workplace\…`）：用 `import.meta.url` 取路径必须过
  `fileURLToPath`，`.pathname` 会保留 `%20`。已修 `check-features.mjs`。
- **仓库里的 `node_modules` 是 Windows 装出来的**：**不要**在 Linux 沙箱里拿它构建
  （rollup/esbuild 的原生二进制是 Windows 的）。反过来也一样。
- 沙箱侧：FUSE 挂载写小文件慢约 84 倍（构建要放 VM 本地）、挂载拒绝 unlink、
  `/tmp` 里有别的会话残留。

## 8. 关键文件地图

| 关注点 | 位置 |
| --- | --- |
| 三维入口与装配（三套浮层的宿主端口都在这） | `src/main.ts` |
| 内容 → 三维数据的契约与校验 | `src/blog-adapter.ts`、`src/data.ts` |
| 列 / 泳道 / 居中（**列数由数据推导，不写死**） | `src/archive-loop.ts`、`src/scene.ts` |
| 功能模块 | `src/features/{reader,album-viewer,music-player,site-viewer}/` |
| 内容侧唯一数据源 | `content/{posts,pages}`、`content/lab-collections.json`、`content/gallery.json`、`content/music.json` |
| 素材 | `apps/blog/public/shots/`（132 图，17MB）、`public/music/`（4 首 + 封面 + LRC，43MB） |
| 构建与校验脚本 | `scripts/blog/`、`scripts/check-features.mjs` |
| 旧内容 → 新契约的迁移器 | `scripts/migrate-content.mjs`（可重跑，**逐字节复现**已提交内容） |

## 9. 与上游的关系

与上游**没有共同 git 祖先**，上游更新只能"内容级移植"（`docs/UPSTREAM.md` 有重叠区分析方法）。
上游自带文件一律保持原路径，本站新增集中在 `src/features/`，所以同步时的冲突面收敛在
`main.ts` 的装配块附近。

## 10. 第三方权利（不随站点授权）

132 张游戏截图、4 首商业发行音乐（V.K克 / SawanoHiroyuki[nZk] / supercell）、
21 个产品商标图标、天气接口 —— 均**不随站点授权**，仅站内使用。（giscus 已不引入。）
