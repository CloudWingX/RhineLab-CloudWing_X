# 交接记录（截至 2026-09-26 深夜）

> 这份是**接手入口**：先读它，再按需读 [FEATURES.md](FEATURES.md)（模块边界）、
> [BUILD.md](BUILD.md)（构建与部署）、[UPSTREAM.md](UPSTREAM.md)（与上游的关系）。
> 各功能的专项说明在 [READER.md](READER.md) / [ALBUM.md](ALBUM.md) / [MUSIC.md](MUSIC.md)。

## 1. 一句话现状

旧站 `endfield-blog` 的**内容已全部迁入**、**主要功能已搬了三分之二**；
本仓库（新基座）**本地构建全绿、本地预览可用**；**从未部署过**。

## 2. 仓库、分支与远程

| 对象 | 位置 | 说明 |
| --- | --- | --- |
| **新站实施现场** | 本仓库，分支 `migration/cloudwing` | 相对上游 `007313b` 共 **14 个提交** |
| 上游模板 | `github.com/JesseLee-CN/rhinelab-blog-theme` | ⚠️ `git remote -v` 里的 `origin` **指的就是上游**，别直接 push |
| 旧站（内容来源） | `D:\deep seek workplace\endfield-blog` | **只读**，不修改 |
| 已放弃的旧基座尝试 | `cloudwing-terminal/` | 13 个提交留作对照，**不要再推进** |

要推送得先加自己的远程：
```bash
git remote rename origin upstream
git remote add origin <你自己的仓库地址>
git push -u origin migration/cloudwing
```

## 3. 已完成（14 个提交，从新到旧）

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

## 4. 未完成

1. **还有三个功能没搬**（旧站 13 条路由对照）：
   - **农历日历**（旧 `/calendar/`）—— 未开始
   - **21 站点导航目录**（旧 `/nav/`）—— 未开始
   - **giscus 评论**（旧 `/account/`）—— 未开始；新站的 `/account/` 目前是占位页，正好留给它
2. **两个旧 URL 的处置未定**：`/gallery/` 与 `/music/`。两个栏目**已经搬进 `/lab/` 阵列**了，
   但这两个**旧地址**要不要 301（指到 `/lab/` 还是保持 404）还没决定。
   `_redirects` 生成器里它们仍列在"尚未搬迁"的注释里 —— 那句注释现在**已经过期**（见
   `scripts/blog/build-redirects.mjs` 的 `PENDING`）。
3. **从未部署**：CF Pages 的配置（`wrangler.toml`、`_headers`、`_redirects`）都在仓库里备好了，
   但控制台还没建项目。部署前**必须先处理 `/gallery/` 与 `/music/`**，否则旧地址会 404。
4. **延后项**：双环标志与开场字形表的重做（站长定"等网页完成后再说"）。

## 5. ⚠️ 待真机确认（沙箱里验不了的两处）

这两件事**必须有真实浏览器**才能确认，交接时它们的状态是"已实现但未验证"：

1. **音频能不能真的响**。沙箱里无头 Chrome 的媒体元素表现不一致：同一页面里内联写一遍同样的
   Blob 播放流程能播、时钟正常推进，但播放器里的元素始终 `readyState=0`。**无法判定是环境还是代码**。
   → 真机上打开一首歌的档案详情、点「播放」；不响的话看浮层左下角的状态文案（它现在会显示失败原因）。
2. **三维阵列 8 列的外观**。页面持续跑 rAF 动画，截图会卡死，所以只能目视：
   第 8 列（音乐）加进来后，阵列的边缘与居中是否仍然齐整（列数是偶数、`LANE_CENTER` 因此是 3.5）。

## 6. 构建与验证

```bash
npm ci                # 首次；仓库里没有 node_modules（不进 git）
npm run build         # 统一构建，七步链
npm run preview -- --open   # 预览真实产物 dist/
```
或者**双击仓库根的 `打开预览.cmd`**（构建 + 预览 + 开浏览器）；端口被占用时会自动顺延。

七步链：`check:content → check:features → build:blog → build:lab → build:redirects → search:index → check:site`

**当前验证状态**（2026-09-26 深夜，Linux 侧）：`typecheck` 0 报错、`check:features` 通过
（3 个功能：reader / album-viewer / music-player）、`npm run build` **exit 0**、
`check:site` 通过、dist 46 页。

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
| 三个功能模块 | `src/features/{reader,album-viewer,music-player}/` |
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
21 个产品商标图标、giscus、天气接口 —— 均**不随站点授权**，仅站内使用。
