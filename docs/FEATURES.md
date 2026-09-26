# 功能模块划分（相对上游新增的功能）

本模板在上游 RhineLabUI 之外增加了若干功能。本文说明它们的模块边界、装配方式，以及
后续**增删一个功能**时要动哪些地方。审阅结论是：功能代码可以完全脱离核心存在，核心不需要
知道功能的实现细节；边界由 `npm run check:features` 强制。

## 1. 审阅结论：改造前后

改造前，阅读层的集成逻辑直接写在 `src/main.ts` 里，并用模块级变量与核心状态互相引用：

| 位置 | 改造前 | 现在 |
| --- | --- | --- |
| 阅读层 | `main.ts` 原 116–214 行、共 99 行集成代码：懒加载、请求令牌、焦点、守卫、pagehide、HMR 清理，并直接持有 `ImmersiveReader`；核心别处另有 30 余处引用 | `src/features/reader/index.ts` 的门面，`main.ts` 只装配 7 个宿主端口成员 |
| 文件位置 | 自有文件与上游文件平铺在 `src/` 根，靠文件名前缀区分 | 自有文件集中在 `src/features/<id>/`，上游文件路径不动 |
| 样式归属 | 功能的 CSS 由 `main.ts` 逐个 `import` | 归属功能：随各自入口引入（三个功能各有 `styles.ts`，懒加载的随 chunk 走） |
| 边界约束 | 无（只靠约定） | `features.manifest.json` + `npm run check:features`，四条规则逐条校验 |
| 首屏负担 | 阅读层 CSS（17.0 KB / gzip 3.5 KB）在首屏样式表里 | 移出首屏，进入阅读层自己的懒加载 chunk |

`src/main.ts` 因此只剩装配块、门面调用（`readerFeature.…` / `albumViewerFeature.…` /
`musicPlayerFeature.…`）与宿主端口实现。

## 2. 功能清单

清单的唯一事实来源是仓库根的 [`features.manifest.json`](../features.manifest.json)。

### 2.1 沉浸式 Markdown 阅读（`reader`）

- **职责**：在档案详情里原地打开全文窗口——内容加载与安全白名单、目录导航、滚动恢复、
  焦点与 inert 所有权、错误与重试，以及“从详情链接进入阅读层”的全部集成逻辑。
- **目录**：`src/features/reader/`
  - `index.ts` 唯一入口 + 门面（懒加载、请求令牌、守卫、焦点恢复、pagehide、HMR 清理）
  - `reader.ts` 阅读层生命周期；`loader.ts` 内容加载；`toc.ts` 目录导航
  - `reader.css` / `markdown.css` 样式；`styles.ts` 样式懒加载入口
- **加载方式**：按需 `import()`。阅读层连同 HTML 解析栈与样式表都不进三维入口首屏。
- **宿主端口** `ReaderHost`：`currentTarget`、`isArchiveReady`、`isIdentityGateActive`、
  `currentMode`、`notify`、`playSound`、`setSceneInputSuspended`。
- **门面** `ReaderFeature`：`isActive`、`ownsEvent`、`open`、`closeIfActive`、
  `closeForContextChange`、`withClosed`、`release`、`snapshot`、`dispose`。
- **共享库**：`shared/reading/`（契约、几何、内容白名单、URL 策略、指纹、滚动存储、srcset、
  prose 样式）。博客构建与阅读层共用，因此放在 `shared/` 而不是功能目录里。
- **检查**：`test:reader`、`test:reader-e2e`、`check:reader`、`check:reader-content`、
  `build:reader-fixtures`。
- **行为说明**：[READER.md](READER.md)。

### 2.2 影像档案（图集）查看器（`album-viewer`）

- **职责**：在**档案记录页面**（档案详情面板）点「查看详情」，原地打开一个居中窗口，逐张浏览该
  图集（Minecraft / Peak / 黑暗之魂2 / AI生成 / 壁纸）的影像——翻页、缩略图条、键盘导航、
  焦点与关闭事务。窗口复用三个系统弹框与阅读层的同一套表面。
- **目录**：`src/features/album-viewer/`
  - `index.ts` 唯一入口 + 门面（懒加载、归属守卫、快照、HMR 清理）
  - `viewer.ts` 浮层生命周期；`viewer.css` 样式；`styles.ts` 样式懒加载入口
- **加载方式**：按需 `import()`。查看器与其样式表都不进三维入口首屏。
- **宿主端口** `AlbumViewerHost`：`isArchiveReady`、`isIdentityGateActive`、`currentMode`、
  `notify`、`playSound`、`setSceneInputSuspended`。
- **门面** `AlbumViewerFeature`：`isActive`、`ownsEvent`、`open`、`closeIfActive`、
  `withClosed`、`snapshot`、`dispose`。
- **数据来源**：`content/gallery.json` → `scripts/blog/build-lab-content.mjs` 生成
  `.generated/lab-content.json` 的 `records`（`kind: "album"`，与文章档案**同一个数组**）与 `columns`。
  影像档案因此**就是三维阵列里的两列**（游戏影像 / 影像图集），列数由数据推导，代码不写死。
- **检查**：`check:features`（本模块暂无专属检查脚本）。
- **行为说明**：[ALBUM.md](ALBUM.md)。

### 2.3 音乐档案播放器（`music-player`）

- **职责**：放**音乐档案**（一条记录 = 一首歌）——黑胶唱片、播放控制、**LRC 同步歌词**、
  播放参数。入口是音乐档案详情里的「播放」按钮，浮层**只放这一首**（没有曲目表、没有切歌）。
- **目录**：`src/features/music-player/`
  - `index.ts` 唯一入口 + 门面（懒加载、归属守卫、快照、HMR 清理）
  - `player.ts` 浮层生命周期、播放控制、LRC 解析与同步、Blob 载入；`player.css` 样式；
    `styles.ts` 样式懒加载入口
- **加载方式**：按需 `import()`。播放器与其样式表都不进三维入口首屏。
- **宿主端口** `MusicPlayerHost`：`isArchiveReady`、`isIdentityGateActive`、`currentMode`、
  `notify`、`playSound`、`setSceneInputSuspended`，外加两个特有的：`setBackgroundMusic`
  （打开时停掉 `/lab/` 的环境 stem、关闭时交还，否则两路声音叠加）与 `stageScale`
  （浮层挂在 `document.body` 上、不在 `#stage` 里，需要自己乘上舞台缩放才能与系统弹框等大）。
- **门面** `MusicPlayerFeature`：`isActive`、`ownsEvent`、`open`、`closeIfActive`、
  `withClosed`、`snapshot`、`dispose`。
- **数据来源**：`content/music.json` → `scripts/blog/build-lab-content.mjs` 把每首歌转成一条
  `kind: "music"` 的**档案记录**并入 `records`（类别 `音乐`）—— 于是「音乐」是三维阵列里真实的一列，
  与文章档案、影像档案共享选中/取景/详情/索引逻辑，只有详情模板与操作按钮按 `kind` 分叉。
- **播放方式**：整曲取成 Blob 再播（本地 blob 天然可 seek），因此**不引入 Service Worker**
  —— CF Pages 的静态资产不支持 Range 请求，旧站为此加了 SW，本站用 Blob 绕开。
- **检查**：`check:features`（本模块暂无专属检查脚本）。
- **行为说明**：[MUSIC.md](MUSIC.md)。

### 2.4 其他新增能力（不在 `src/features/`）

这些是构建面而不是运行时功能模块，保持原有目录：

| 能力 | 位置 | 与 `src/features/` 的关系 |
| --- | --- | --- |
| Markdown 博客（Astro 子应用、内容集合、RSS/sitemap/搜索） | `apps/blog/`、`content/`、`scripts/blog/` | 独立构建目标，不引用功能模块源码 |
| 三维入口的博客数据桥 | `src/blog-adapter.ts`、`src/data.ts` | 属于核心数据源，阅读层、影像查看器与音乐播放器都依赖它 |
| 自托管字体（MiSans、JetBrains Maple Mono） | `public/fonts/`、`shared/*.css`、`scripts/blog/prepare-assets.mjs` | 跨两个构建目标共享的白名单 |
| 上游细粒度动效开关 | `src/motion-preferences.ts` 起（上游 `6185da2`） | 已在上游主线内，不属于本站新增 |

## 3. 边界规则

`npm run check:features` 校验四条规则，任一不通过即非零退出：

1. **清单与磁盘一致**：`dir`/`entry`/`styles` 存在，`publicApi` 确实从入口导出，`checks`
   在 `package.json` 中存在，`serverSide`/`ops`/`scripts`/`shared`/`docs` 指到的路径存在。
2. **外部只走入口**：`src/` 中功能目录之外的文件只能引用 `<dir>/index.ts`，深入
   `<dir>/xxx.ts` 会被报为 `deep-import`。
3. **功能之间不互相穿透**：功能文件引用另一个功能的任何文件会被报为 `cross-feature`；
   允许功能依赖核心（`../../*.ts`）与 `shared/`。
4. **没有孤儿文件**：功能目录里每个源文件都必须能从 `entry` 或 `styleEntry` 的引用链到达。

该命令已纳入 `npm run build` 的统一构建序列（在 `check:content` 之后、构建之前）。

## 4. 增删流程

### 新增一个功能

1. `src/features/<id>/` 放实现，写 `index.ts`：导出 `XxxHost`（需要核心提供什么）、
   `createXxxFeature(host)`（返回 `XxxFeature` 门面）。
2. 功能**不**直接读核心的模块级变量；需要什么就在 `XxxHost` 里声明一个方法，由
   `main.ts` 实现。核心要调功能时只调门面方法。
3. 在 `main.ts` 的装配点创建门面（位置要匹配加载策略：首屏可见的放在任何 `await` 之前）。
4. 在 `features.manifest.json` 增加条目；`eager` 必须显式声明，`runtimeMarkers` 填该功能
   产物的 chunk 名特征。★该字段当前没有消费者★：原先读它判断「博客页没有加载 lab 资源」的
   `check:artifacts` 已随 `auth` 一并移除；新功能仍应填，便于以后恢复产物检查。
5. `npm run check:features`、`npm run typecheck`、`npm run build` 全绿。

### 移除一个功能

以移除 `reader` 为例，顺序如下（反向执行即可，无需改动核心逻辑）：

1. 删 `src/features/reader/`。
2. 删 `main.ts` 里的装配块（`const readerFeature = createReaderFeature({…})`）与所有
   `readerFeature.…` 调用，以及 HMR 里的 `readerFeature.dispose()`。
3. 删 `features.manifest.json` 的 `reader` 条目。
4. 删该功能独有的检查与脚本：`scripts/reading/`、`package.json` 中对应的 5 条 npm 命令、
   `shared/reading/`（若无其他引用；博客样式里的 `@reading/prose.css` 需一并处理）。
5. 删 `docs/READER.md` 并在 [README.md](README.md) 文档索引里去链。
6. `npm run check:features` 会报出任何遗漏（残留清单项、孤儿文件、无法解析的引用），
   `npm run typecheck` 与 `npm run build` 兜住其余问题。

`auth`（启动身份门 / 登录注册 / Go + SQLite 认证服务）已按同一流程移除，见
[HANDOFF.md](HANDOFF.md) §3 的 `190a061`：删掉前端门后 `/lab/` 直接以 GUEST 进入档案，
三维核心未改动。

## 5. 与上游同步的关系

- 上游自带文件一律保持原路径与原文件名，因此上游同步仍是**逐文件内容级移植**，
  路径不需要重写；新增功能集中在 `src/features/`，不会再增加 `src/` 根目录的重叠面。
- 功能模块只以“宿主端口 + 门面”接触核心，所以上游改动 `main.ts` / `scene.ts` 时，
  冲突面收敛在装配块附近。当前重叠面见表见 [UPSTREAM.md](UPSTREAM.md) §6。
- 上游没有对应实现的功能（本文全部）在同步时不参与三方合并，只做回归验证。

## 6. 验证

```bash
npm run check:features     # 模块边界（本文四条规则）
npm run check:imports      # 相对导入静态解析（tsc 覆盖不到的 apps/blog 也在内）
npm run typecheck          # 类型与路径（含 check:imports）
npm run test:reader        # 阅读层契约（reader）
npm run build              # 统一构建（含 check:features）
```

改动功能模块时，除了上面的命令，还应在真实浏览器里跑一次对应端到端：
`npm run test:reader-e2e`（阅读层总门）。

### 6.1 模块化改造的验证记录（2026-09-24）

> 本节是当时（2026-09-24）的记录；此后 `auth` 已移除，现为 3 个功能（见 §2）。

改造在开放仓库完成，逐项结果如下（同一台机器、同一依赖锁文件）：

| 检查 | 结果 |
| --- | --- |
| `check:features` | 通过：2 个功能、入口唯一、无跨功能穿透、无孤儿文件；另用三类反例验证守卫会失败（键名改名 / 孤儿文件 / 深入内部引用） |
| `typecheck` | 通过 |
| `test:reader` / `test:blog` / `check:motion-preferences` | 全部通过（81+1skip / 17 例，动效偏好 12+6 例） |
| `build:blog` + `build:lab` + `search:index` + `check:site` | 通过 |
| `test:reader-e2e`（chromium，IR5 三套件） | **19/19 用例、337/337 检查通过**（改造前基线：14/19 用例、327/335 检查，失败项与本次改造无关，见 §6.2） |

首屏产物变化：阅读层 CSS（17.04 KB / gzip 3.53 KB）从 `index-*.css` 移入懒加载的
`styles-*.css`，`/lab/` 首屏只加载 `index-*.js` 与 `index-*.css`。

### 6.2 顺带修正的过期端到端期望

模板的文章被替换为示例内容后，各功能的端到端门禁里还留着一批**写死私有仓库正文**的
期望值，表现为长期为红或静默空检查。这与模块化无关，但会让「改功能后跑门禁」失去意义，
因此一并修正：

| 位置 | 问题 | 修正 |
| --- | --- | --- |
| `scripts/reading/run-e2e.mjs` | Pagefind 正向检索词写死为私有文章的 `Multisim` | 从被断言文章已构建的正文派生（现取到 `Unicode`） |
| `scripts/reading/e2e/content.mjs` | 「初始 chunk 不含正文」探针写死私有文章句子 | 探针改为被服务文章正文的末 30 字 |
| `scripts/reading/e2e/interaction.mjs`、`failure.mjs` | `textLength > 4000` 绝对阈值 | 与被服务页面 `.prose` 的文本长度比较（≥80%） |
| `scripts/reading/e2e/interaction.mjs` | 滚动恢复按「距文末 400px」「> max×0.25」判定 | 按契约 §7 的锚点公式判定；不再假设文末之后没有内容 |

对照实验证明这些失败与模块化无关：把改造临时 `git stash` 回 HEAD 后重新构建，阅读层
端到端得到**完全相同的 5 个失败用例与 327/335 检查**。
