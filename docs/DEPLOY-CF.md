# 部署到 Cloudflare Pages

## 0. 建项目时照着填（TL;DR）

| 控制台项 | 填什么 |
| --- | --- |
| 连接 Git | GitHub → 授权 Cloudflare Pages ★私有仓库要手动加进授权范围★（见 §1.5） |
| 选择仓库 | `CloudWingX/CloudWing_X` |
| 生产分支 | `migration/cloudwing` |
| 构建命令 | `npm run build` |
| 构建输出目录 | `dist` |
| 框架预设 | **None / 无** —— 本项目是 npm workspace + 自定义构建链，不要让预设插手 |
| 环境变量 | ★`BLOG_SITE_ORIGIN` = `https://www.cloudwing.top`★（必设 + 改后要重新部署）；`NODE_VERSION` = `22.23.2`（可选，CF 默认的 24.18.0 也全绿） |
| 自定义域名 | `www.cloudwing.top`（见 §1.6） |

等构建跑完（约 3–5 分钟）→ 拿到 `*.pages.dev` 域名 → 接自定义域名 → 按 §4 的清单核对。


本站是纯静态产物（`dist/`），托管在 CF Pages。**仓库侧的配置都已就绪**，这份文档记的是：
控制台要设什么、部署前必须先做什么、以及**部署后要逐项核对什么**。

## 1. 先确认仓库侧已就绪

| 东西 | 位置 | 状态 |
| --- | --- | --- |
| 构建命令 | `package.json` 的 `build` | `npm run generate:lab-content && node scripts/blog/build-site.mjs`（八步链） |
| 产物目录 | `dist/` | 仓库根 |
| 缓存与安全响应头 | `apps/blog/public/_headers` | Astro 会把 `public/` 原样复制到产物根 → `dist/_headers` |
| 重定向表 | 由 `scripts/blog/build-redirects.mjs` 生成 | → `dist/_redirects`（**不要手写**，生成器独占） |
| 项目配置 | `wrangler.toml` | 项目名 + 产物目录 + `npx wrangler pages dev dist` 本地预览 |
| 站点 origin | `apps/blog/astro.config.mjs` | 默认 `https://www.cloudwing.top`（`BLOG_SITE_ORIGIN` 可覆盖） |

★`git remote` 已经理清★：`origin` = 本项目的仓库，`upstream` = 上游模板且 **push 地址被改成
`DISABLED_UPSTREAM_IS_READ_ONLY`**（照模板 `ops/setup-remotes.sh` 的做法，物理上推不上去）。
CF Pages 的 Git 集成要从 `origin` 拉。

## 1.5 仓库：★先确认私有，再推★

项目仓库：`https://github.com/CloudWingX/CloudWing_X`（`origin`）。

**这个仓库必须保持私有。** 因为下列素材**都是 CF 构建必需的输入**（构建链要把它们复制进产物，
所以拿不掉），而 HANDOFF §10 写明它们「不随站点授权，仅站内使用」：

| 素材 | 位置 | 体量 |
| --- | --- | --- |
| 游戏影像（截图） | `apps/blog/public/shots/` | 132 张 / 17 MB |
| 商业发行曲目 | `public/music/` | 4 首 / 约 42 MB（V.K克 / SawanoHiroyuki[nZk] / supercell） |
| 产品商标图标 | `apps/blog/public/nav/` | 21 个 |

推到公开仓库 = **公开再分发**这些内容。★顺序是"先切私有、再 push"★ —— 推出去的内容会进
GitHub 的缓存与可能的 fork，事后改可见性收不干净。
（Cloudflare Pages 支持从私有仓库构建，部署不受影响。）

```bash
git push -u origin migration/cloudwing    # 这个分支会成为默认分支
```

★私有仓库还要在 CF 的 GitHub App 里授权★：控制台建项目时选 GitHub —— 若仓库列表里看不到它，
去 GitHub 的 Settings → Applications → Cloudflare Pages，把该仓库加进授权范围。

## 1.6 域名：本站住在 `www.cloudwing.top`

同一个域名上有**两个站**（同一个 CF 账号下各自的项目）：

| 主机名 | 是什么 |
| --- | --- |
| `cloudwing.top`（apex） | **旧站**（`endfield-blog` 那一版：暗色视频背景、画廊 / 音乐 / 导航 / 互动） |
| `www.cloudwing.top` | **本站**（新基座：三维终端 + `/blog/` + `/calendar/` + `/lab/`） |

一个主机名只能指向一个站，所以本站用 `www`（站长 2026-09-26 定：两个站并存，不接管 apex）。
在 CF 控制台：**项目 → Custom domains → 填 `www.cloudwing.top`**。

★**必须在 CF 的环境变量里设 `BLOG_SITE_ORIGIN=https://www.cloudwing.top`**★，改完**重新部署**
一次才生效。不设的话 canonical / og:url / sitemap / RSS 会指向 `cloudwing.top`，也就是**旧站**——
2026-09-26 第一版部署实测正是这个毛病：新站的 canonical 写着 `https://cloudwing.top/blog/`，
而那个地址是**旧站的「归档」页**，内容完全不同。

⚠️ **并存期间的重复内容**（已知、暂不处理）：新站的文章是从旧站迁来的，同一篇内容在
`cloudwing.top/posts/<slug>/`（旧）与 `www.cloudwing.top/<YYYY>/<MM>/<DD>/<slug>/`（新）都能打开。
`www` 侧的 `_redirects` 已把**旧路径**映射到新路径（在 www 域内有效），但 apex 上的旧站仍会用自己的
地址回一份 200。彻底解决要等站长决定旧站何时下线（或让旧站整体 301 到新站）。

## 1.9 ★建项目时必须选 Pages，不是 Workers★（实测踩过）

2026-09-26 实录：项目建成了 **Worker**，构建全绿之后挂在最后一步 ——

```
Executing user deploy command: npx wrangler deploy
✘ [ERROR] The Cloudflare application detection logic has been run in the root of a
  workspace instead of targeting a specific project.
```

两个判据（见到任一条就说明走错了流程）：

1. **日志里有 `Executing user deploy command`** —— ★Pages 构建没有"部署命令"这一步★，它只认
   "构建输出目录"。有部署命令 = Workers Builds（`wrangler deploy` 默认值）。
2. **报错来自 wrangler 的"应用探测"** —— 本仓库 `package.json` 有 `workspaces`，wrangler 在
   workspace 根目录拒绝猜是哪个应用，于是失败。

正确路径：`Workers & Pages → Create → **Pages** 标签 → Connect to Git`，然后只填两项
（构建命令 `npm run build`、输出目录 `dist`），**没有部署命令**。

为什么不干脆改成 Worker：本仓库的 `wrangler.toml` 写的是 `pages_build_output_dir`
（**Pages 专用键**），`_headers` / `_redirects` 也是按 Pages 语义配的 —— 换 Workers 得把
配置整套改成静态资源 Worker，没必要。

## 2. 控制台要设的三项

| 项 | 值 | 为什么 |
| --- | --- | --- |
| 构建命令 | `npm run build` | 它已含 `generate:lab-content`（模板原本的 build 缺这一步，干净 clone 会挂在 `check:features`） |
| 输出目录 | `dist` | |
| `NODE_VERSION` | `22.23.2` | 实测通过的版本（README 写 24.14.0 无实测记录）。
★2026-09-26：CF 默认的 Node 24.18.0 也把八步链全绿跑完了★ —— 这个 pin 是为了让构建可复现，不是硬要求 |

★`BLOG_SITE_ORIGIN` 必须设成 `https://www.cloudwing.top`★（默认值已经是它，但线上要显式设 + 重新部署）。

**依赖安装是干净的**：全仓库**没有任何 `postinstall` / `prepare`**，所以 CF 的 `npm ci`
不会跑额外的构建或下载（`playwright` 的包清单里没有安装期脚本 —— 它不再自动下载浏览器，
而构建链也用不到它）。

**产物在 CF 限额之内**（实测）：最大单文件 13.0 MB（一首 mp3，上限 25 MB）、文件总数约 1850
（上限 20000）。

## 3. 部署前必须先做的事

```bash
npm ci                 # 仓库里没有 node_modules（不进 git）
npm run build          # 八步链，必须 exit 0
npm run preview -- --open
```

★**这一步沙箱里做不了**★（磁盘约束 + `node_modules` 平台相关），所以**必须先在真机跑通一次
构建**，再谈部署。构建红了就别推。

## 4. 部署后逐项核对

### 4.1 入口与路由（这批是本轮改动的重点）

- [ ] `https://<域名>/` → **直接进三维终端**，且**地址栏保持 `/`**（根路径是 `_redirects` 的 200 rewrite）
- [ ] `https://<域名>/blog/` → 博客首页（标题「云翼」，文章列表）
- [ ] `https://<域名>/lab/` → 同一套终端（真实产物目录）
- [ ] 终端设置弹框底部的 `BLOG HOME` → 能到 `/blog/`
- [ ] 旧地址 301：`/gallery/`、`/music/`、`/nav/` → `/lab/`；`/posts/<旧 slug>/` → 对应的新文章地址
- [ ] 未知路径 → **真实 404**（不是回落首页）

### 4.2 三维档案（沙箱里验不了的）

- [ ] 阵列 **9 列**（5 文章主题 + 2 影像大类 + 音乐 + 网站导航）；左右切列时整体平移、边缘不跳
- [ ] 选中的卡片**正好落在抽出的模型下方居中**（本轮修过 1.5 列错位）
- [ ] 每列刻度条都是 **8 个**
- [ ] **音频真的响**（打开一首歌的详情 → 播放；不响就看浮层左下角的状态文案）
- [ ] 影像 / 音乐 / 网站导航三类档案的详情都有 `01/02/03` 页签，摘要排版与文章档案一致
- [ ] 三类都能收藏，且**收藏页里每个只出现一次**（曾经按文章 id 存，会重复）
- [ ] 三个下载入口真的下到东西：文章 `EXPORT ↓`（TXT 能打开）、影集 `IMAGES ↓`（ZIP 能解压）、
      曲目 `AUDIO ↓`（mp3 能下）
- [ ] 网站导航档案的 `[浏览站点]` → 浮层卡片墙；图标不是破图、卡片是新标签打开、ESC 能关

### 4.3 博客页

- [ ] `/calendar/` 月历：今天（按访客本地时间）有高亮；`‹` `›` 能翻月且在数据边界处禁用；
      `休/班/节/气/●` 图例对得上（例：2026-09-25~27 是中秋假期、10-01 起国庆）
- [ ] 顶栏 7 项都在：归档 / 分类 / 标签 / 日历 / 搜索 / RSS / 三维档案

### 4.4 响应头与缓存

```bash
curl -sI https://<域名>/lab/            # 期望 Cache-Control: public, max-age=0, must-revalidate
curl -sI https://<域名>/                # 同上（终端入口）
curl -sI https://<域名>/lab/assets/xxx.js   # 期望 immutable（带哈希的文件名）
curl -sI https://<域名>/lab/archives/CLOUDWING-X-001.txt   # 期望 max-age=3600（文件名不带哈希）
```

- [ ] 部署后**刷新页面看到的是新版本**（HTML 没被缓存住）

## 5. 已知不确定 / 需要观察的

1. **200 rewrite 与静态文件的优先级**：CF 文档确认了 200 代理只能站内、且语法是 `/a /b 200`，
   但没写"请求路径上已有静态文件时谁赢"。★我们**不依赖**这个语义★ —— `check-site` 已经断言
   `dist/index.html` **不存在**（根路径上没有静态文件），所以两种语义下结果一致。
2. **`_headers` 的 splat 规则**：官方原话是「`*` 贪婪匹配所有字符，每条规则**只允许一个** splat」,
   所以 `/*.html` 合法；而 `/` 与 `/lab/` 的请求路径里没有 `.html`，**盖不住**，因此已单独给规则。
3. **`_redirects` 的匹配**按精确路径（含结尾斜杠）；CF 会把目录请求补成带斜杠的形式，
   所以 `/nav` → `/nav/` → 301 → `/lab/` 这条链路要在真机上确认一次。
4. **音频**：沙箱里无法判定是环境还是代码（见 HANDOFF §5），只有真机能确认。
