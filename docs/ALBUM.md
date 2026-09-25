# 影像档案（图集）查看器（album-viewer）

在 `/lab/` 的**档案记录页面**（档案详情面板）点「查看详情」，会在**原地**打开一个居中窗口，
逐张浏览该图集的影像——不跳转页面、不 pushState、不写 hash。窗口复用三个系统弹框
（ARCHIVE INDEX / SAVED / SYSTEM）与阅读层的同一套表面，因此窗口盒、遮罩、进出动画
与它们逐像素一致。

## 1. 两个大类与一条档案的含义

| 你的说法 | 系统里的东西 |
| --- | --- |
| 大类 | 档案记录的 `category`：`游戏影像` / `影像图集` |
| 一个档案 = 一个小类 | 一条**影像档案记录**（`LabAlbum`），例如 `Peak` |
| 档案记录页面 | `#detail-ui` 档案详情面板（`renderAlbumDetail`） |
| 查看详情按钮 | 详情面板操作区的 `[data-action="open-album-viewer"]` |
| 图像界面 | 本模块的居中浮层 |

## 2. 数据从哪来

图集数据在 `content/gallery.json`（与 `content/lab-collections.json` 同级，属"内容侧唯一数据源"）：
`categories` 是两个大类，`items` 是 132 条影像。构建时 `scripts/blog/build-lab-content.mjs`
把它转成档案记录，写进 `.generated/lab-content.json` 的 **`albums`** 数组（与文章档案的
`records` 分开）。

⚠️ **影像档案不进三维阵列**：`albums` 不参与 `columns` / `columnFiles` / `fileLocation` 的
槽位计算，`src/scene.ts` 一行没改。因此它们从**档案索引**进入，且详情面板**不让相机进 detail
取景**（`setMode("detail", "archive")`），背景停在档案阵列——否则相机会聚焦到上一个被选中的
文章卡片上，露出不相关的物体。

| 层 | 位置 |
| --- | --- |
| 数据源 | `content/gallery.json` |
| 大类划分表（显式） | `scripts/migrate-content.mjs` 的 `ALBUM_CATEGORIES` |
| 生成 | `scripts/blog/build-lab-content.mjs` → `.generated/lab-content.json` 的 `albums` |
| 适配与校验 | `src/blog-adapter.ts`（`LabAlbum` / `AlbumImage`，单独校验） |
| 聚合导出 | `src/data.ts`（`albums` / `albumCategories`） |
| 索引入口与详情模板 | `src/main.ts`（`renderAlbumDetail` / `openAlbumDetail` / `renderResults`） |
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

- **打开**：只在 `mode === "detail"` 且宿主就绪时打开；`await` 懒加载之后会**重新确认归属**
  （模式是否仍是 detail、是否已经有别的查看器打开），避免竞态。
- **翻页**：`←` / `→` 循环翻页，`Home` / `End` 到首尾；缩略图条可直接跳转。单张图集禁用翻页。
- **关闭**：`ESC`（接管 `<dialog>` 的 `cancel`，让退出动效与手动关闭走同一条路）、右上 CLOSE、
  点遮罩空白处。关闭后把焦点**归还给入口按钮**。
- **输入锁**：查看器打开期间冻结三维输入（`setSceneInputSuspended(true)`），关闭时解除。
- **与阅读层的关系**：两者都是挂在 `document.body` 上的顶层浮层，核心用合并判断
  `overlayActive()` / `fromOverlaySurface()` 统一识别"有没有浮层占屏"，因此以后增加浮层
  不必在十余处逐一追加。

## 5. 验证

```bash
npm run check:features   # 模块边界（入口唯一、无跨功能穿透、宿主端口、无孤儿文件）
npm run typecheck
npm run build            # 统一构建（含 check:features）
```

数据侧的断言在生成层（`build-lab-content.mjs`，失败即中断构建）：每个影像 `src` 必须真实存在、
`images.length === count`、图集张数合计 === `items` 总数。这样坏数据在**构建期**就被挡住，
不会发出坏图。
