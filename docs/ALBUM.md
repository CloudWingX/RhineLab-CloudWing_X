# 影像档案（图集）与查看器（album-viewer）

在 `/lab/` 三维阵列里，**游戏影像** 与 **影像图集** 是两列真实存在的档案（与 5 个文章主题列、
1 个音乐列并列，共 8 列）—— 用 `←` `→` 切列就能走到，按 `ENTER`／`ACCESS FILE` 打开档案详情，详情里点
**「查看详情」** 会在原地弹出一个居中窗口，逐张浏览该图集的影像。窗口复用三个系统弹框
（ARCHIVE INDEX / SAVED / SYSTEM）与阅读层的同一套表面，因此窗口盒、遮罩、进出动画与它们逐像素一致。

> 设计演进：第一版把影像档案做成"独立集合、不进三维阵列"，结果它们只存在于检索弹框的第 8 个
> 筛选项里，主界面上一点线索都没有（实测 `/lab/` 主界面出现「游戏影像」0 次）。现在改成：
> **一条影像档案 = 阵列里的一张卡片**，与文章档案同处 `records`，靠 `kind` 区分。

## 1. 两个大类与一条档案的含义

| 说法 | 系统里的东西 |
| --- | --- |
| 大类 | 档案记录的 `category`：`游戏影像` / `影像图集` |
| 一个档案 = 一个小类（图集） | 一条 `kind: "album"` 的档案记录，例如 `X-042`（Peak） |
| 档案记录页面 | `#detail-ui` 档案详情面板（`renderDetail` → 影像分支，与文章/音乐**共用同一版式**） |
| 查看详情按钮 | 详情面板操作区的 `[data-action="open-album-viewer"]` |
| 下载入口 | 同一个操作区的 `IMAGES ↓` —— 该图集**整包影像的 ZIP**（构建期生成） |
| 收藏 | 同一个操作区的收藏按钮（三类档案通用，按**槽位编号**存） |
| 图像界面 | 本模块的居中浮层 |

阵列的列顺序 = `lab-content.json` 的 `columns`：`技术笔记 / 建站日志 / 更新档案 / 版本演进 / 归档总览 /
游戏影像 / 影像图集 / 音乐`。**列数不写死在代码里**（`archive-loop.ts` 从 `archiveColumns.length` 推导）；
**每一列都恰好 8 个槽位**（文章主题、影像大类、音乐同一规则，不足由生成器循环补位）。

## 2. 数据从哪来

图集数据在 `content/gallery.json`（与 `content/lab-collections.json` 同级，属"内容侧唯一数据源"）：
`categories` 是两个大类，`items` 是 132 条影像。构建时 `scripts/blog/build-lab-content.mjs` 把它们
转成**和文章档案同一个 `records` 数组**里的记录（`kind: "album"`）；**一列 8 个槽位**（与文章主题
同一补位规则），所以 5 个图集铺成 16 个槽位（`X-041`–`X-056`），同一图集在一列里会出现多次。

★影像本体不进槽位★：槽位只带 `albumKey`（= 图集名）与 `count / dateFrom / dateTo / cover`，
图片单独放在产物顶层的 `albumImages`（按 `albumKey` 索引，**整份产物只存一次**）——
若每个槽位各带一份 `images[]`，132 条会膨胀到 413 条（首屏 JSON 约 +42KB）。
`src/blog-adapter.ts` 读入后把**同一份数组引用**挂到每个槽位上，所以消费方看到的
`LabAlbumSlot.images` 照旧、内存里也只有一份。因此：

- 阵列的列由 `category` 决定（`src/data.ts` 的 `fileLocation`），影像大类自然成为第 6、7 列；
- 索引筛选、检索、详情面板、阅读层**都不需要为影像档案另写一套分支**——只有真正不同的地方
  （页签正文、操作按钮）才按 `kind` 分叉。

| 层 | 位置 |
| --- | --- |
| 数据源 | `content/gallery.json` |
| 大类划分表（显式） | `scripts/migrate-content.mjs` 的 `ALBUM_CATEGORIES` |
| 生成 | `scripts/blog/build-lab-content.mjs` → `.generated/lab-content.json` 的 `records` + `columns` + `albumImages` |
| 档案下载件 | `scripts/blog/export-archives.mjs` → `public/archives/<图集名>-images.zip`（构建期生成，不入库；由 `prepare:assets` 白名单暂存进 `/lab/archives/`） |
| 适配与校验 | `src/blog-adapter.ts`（`LabPostSlot` / `LabAlbumSlot` / `LabMusicSlot` 判别联合，按 `kind` 分别校验；影像档用 `albumKey` 到 `albumImages` 取图片并挂成共享引用） |
| 聚合导出 | `src/data.ts`（`records` / `albums` / `albumCategories` / `categories` / `archiveColumns`） |
| 轮播泳道 | `src/archive-loop.ts`（`CONTENT_COLUMNS` / `LOOP_COLUMNS` 由列数推导；**`LANE_CENTER` 固定是参考阵列（原片 5 列）的中心 2，不随列数变**） |
| 详情模板 | `src/main.ts`（`renderDetail`，三类档案共用同一版式：kicker / 标题 / 元数据 / 三页签 / 操作区 / 脚注） |
| 查看器模块 | `src/features/album-viewer/` |

## 3. 模块与职责

| 文件 | 职责 |
| --- | --- |
| `src/features/album-viewer/index.ts` | **唯一对外入口**：`AlbumViewerHost`（需要核心提供什么）与 `createAlbumViewerFeature()` 门面；懒加载、归属守卫、快照与 HMR 清理 |
| `src/features/album-viewer/viewer.ts` | 浮层生命周期：`<dialog>` 容器、翻页、缩略图条、键盘、焦点与关闭事务 |
| `src/features/album-viewer/viewer.css` | 表面样式（只用 `--theme-*` 变量，浅色 / 深色自动成立） |
| `src/features/album-viewer/styles.ts` | 样式懒加载入口：CSS 随本模块 chunk 加载，不进三维入口首屏 |

核心只通过门面使用查看器，不接触 `AlbumViewer`：

```ts
interface AlbumViewerFeature {
  isActive(): boolean;
  ownsEvent(event: Event): boolean;
  open(target: AlbumViewerTarget, entry: HTMLElement | null, reduced: boolean): void;
  closeIfActive(): void;
  withClosed<T>(action: () => T | Promise<T>): Promise<T>;
  snapshot(): AlbumViewerSnapshot;
  dispose(): void;
}
```

宿主端口 `AlbumViewerHost`：`isArchiveReady`、`isIdentityGateActive`、`currentMode`、
`notify`、`playSound`、`setSceneInputSuspended`。

## 4. 行为

- **打开**：只在 `mode === "detail"` 且当前档案是 `kind: "album"` 时打开；`await` 懒加载之后会
  重新确认归属（模式是否仍是 detail），避免竞态。
- **翻页**：`←` / `→` 循环翻页，`Home` / `End` 到首尾；缩略图条可直接跳转。单张图集禁用翻页。
- **关闭**：`ESC`（接管 `<dialog>` 的 `cancel`，让退出动效与手动关闭走同一条路）、右上 CLOSE、
  点遮罩空白处。关闭后把焦点**归还给入口按钮**。
- **退出兜底**：`close()` 里给退出动效加了 600ms 上限。动效的完成回调来自 `animation.finished`，
  后台标签页或被节流的合成器可能永远不推进它 → 浮层会冻在屏幕上（无头环境实测如此）。
- **输入锁**：查看器打开期间冻结三维输入（`setSceneInputSuspended(true)`），关闭时解除。
- **与阅读层的关系**：两者都是挂在 `document.body` 上的顶层浮层，核心用合并判断
  `overlayActive()` / `fromOverlaySurface()` 统一识别"有没有浮层占屏"。
- **阅读层对图集说不**：`ReaderHost.currentTarget()` 在 `kind !== "post"` 时返回 `null`，
  所以图集不会被当成文章去加载正文。

## 5. 验证

```bash
npm run check:features   # 模块边界（入口唯一、无跨功能穿透、宿主端口、无孤儿文件）
npm run typecheck
npm run build            # 统一构建（含 check:features）
```

数据侧的断言在生成层（`build-lab-content.mjs`，失败即中断构建）：每个影像 `src` 必须真实存在、
图集张数合计 === `items` 总数（132）。适配层另按 `kind` 校验：`post` 必须有 `postId`/`href`；
`album` 的 `albumKey` 必须在 `albumImages` 里、`images.length === count`、`category` 落在 `columns` 内。

**列结构的断言（生成后可直接核对）**：`columns.length === 8`、**每列恰好 8 槽**、共 64 条；
同一个图集的多个槽位**共享同一份 `images` 数组引用**（在 `data.albums` 里按 `albumKey` 分组比 `===`）。

⚠️ 上一轮的无头 Chrome 端到端（列总数显示 `07`）是在**每列槽位数不均**的形态下跑的，
改成每列 8 槽后需要重跑。`←`/`→` 的列序仍为
`技术笔记 → 建站日志 → 更新档案 → 版本演进 → 归档总览 → 游戏影像 → 影像图集 → 音乐`。
⚠️ **三维阵列本身的外观无法在沙箱里验证**（持续 rAF 动画会让截图卡死），只能靠真机目视。
