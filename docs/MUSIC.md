# 音乐档案与播放器（music-player）

在 `/lab/` 三维阵列里，**「音乐」是一列档案**（与 5 个文章主题列、2 个影像大类并列，共 8 列）：
用 `←` `→` 切列走到它，按 `ENTER`／`ACCESS FILE` 打开**档案详情**，详情里点 **「播放」**
会在原地弹出一个居中窗口放这一首歌——黑胶唱片、进度、音量、**同步歌词**与播放参数。
窗口复用三个系统弹框（ARCHIVE INDEX / SAVED / SYSTEM）以及阅读层、影像查看器的同一套表面。

> 设计演进：第一版把播放器做成导航上的独立 MUSIC 按钮（一个能放全部 4 首的播放器）。
> 现在改成与影像档案同构——**一条档案 = 一首歌**，「音乐」作为阵列里的一列，
> 没有独立入口按钮，浮层也**只放这一首**（没有曲目表、没有上一首/下一首）。

## 1. 曲目与数据

| 层 | 位置 |
| --- | --- |
| 数据源 | `content/music.json`（由 `scripts/migrate-content.mjs` 从旧站 `src/site.ts` 的 `MUSIC` 数组生成） |
| 素材 | `public/music/`：`<id>.mp3` + `covers/<id>.jpg` + `lyrics/<id>.lrc`（共约 43MB） |
| 生成 | `scripts/blog/build-lab-content.mjs` 把每首歌转成一条 `kind: "music"` 的**档案记录**并入 `records`，类别为 `音乐`；同时校验音频与封面真实存在 |
| 构建管线 | `scripts/blog/prepare-assets.mjs` 白名单加 `musicFiles("music")`（lab 的 publicDir 只收白名单，漏登记＝没声音） |
| 适配 | `src/blog-adapter.ts`（`LabMusicSlot`，判别联合的一支）→ `src/data.ts`（`musicTracks`） |
| 模块 | `src/features/music-player/` |
| 入口 | 音乐档案详情里的 `[data-action="play-track"]`（由 `renderMusicDetail` 产出） |

4 首曲目：#1 Evolution Era 与 #3 Wings of Piano 是**纯音乐**，#2 Into the Sky 与
#4 星が瞬くこんな夜に 带 **LRC 歌词**。歌词**不写进 JSON** —— `lyrics/<id>.lrc` 存在即自动同步，
少一个文件就自然退化成"纯音乐"，避免数据与文件两处打架。

## 2. 模块与职责

| 文件 | 职责 |
| --- | --- |
| `src/features/music-player/index.ts` | **唯一对外入口**：`MusicPlayerHost`（需要核心提供什么）与 `createMusicPlayerFeature()` 门面；懒加载、归属守卫、快照与 HMR 清理 |
| `src/features/music-player/player.ts` | 浮层生命周期、播放控制、LRC 解析与同步、Blob 载入 |
| `src/features/music-player/player.css` | 表面样式（只用 `--theme-*` 变量，浅色 / 深色自动成立） |
| `src/features/music-player/styles.ts` | 样式懒加载入口：CSS 随本模块 chunk 加载，不进三维入口首屏 |

核心只通过门面使用播放器，不接触 `MusicPlayer`：

```ts
interface MusicPlayerFeature {
  isActive(): boolean;
  ownsEvent(event: Event): boolean;
  open(tracks: MusicTrack[], entry: HTMLElement | null, reduced: boolean): void;
  closeIfActive(): void;
  withClosed<T>(action: () => T | Promise<T>): Promise<T>;
  snapshot(): MusicPlayerSnapshot;
  dispose(): void;
}
```

宿主端口 `MusicPlayerHost`：`isArchiveReady`、`isIdentityGateActive`、`currentMode`、`notify`、
`playSound`、`setSceneInputSuspended`，加上两个本模块特有的：

- **`setBackgroundMusic(enabled)`** —— `/lab/` 本来就有 3 条环境循环 stem（设置里的
  「观测室 · 背景音乐」）。打开播放器时传 `false` 让核心停掉它们，关闭时传 `true` 交还，
  否则两路声音会叠在一起。
- **`stageScale()`** —— ★这是本模块最容易做错的一处★：功能浮层挂在 `document.body` 上、
  **不在 `#stage` 里**，因此不会被舞台的 `transform: scale()` 缩放；而 `#stage` 里的三个系统弹框
  是被缩放过的。浮层必须自己乘上这个比例才能与它们等大（实测：舞台缩放 0.926 时，
  弹框实际渲染 1167×774，未缩放的浮层是 1260×836）。`--stage-scale` 设在 `#stage` 的元素样式上，
  body 上的浮层读不到，所以只能由宿主端口把数值给出去。

## 3. ★为什么用 Blob 播放★

CF Pages 的静态资产**不支持 Range 请求**，浏览器媒体栈会把 seek 钳回 0（点进度条 ≈ 重头播放）。
旧站的做法是加一个 Service Worker 拦截 `/music/*.mp3` 的 Range 请求、本地缓存整曲后回 206。

**本站改为**：切曲时把整曲 `fetch` 成 Blob，再让 `audio.src` 指向 blob URL —— 本地 blob 天然可 seek，
**因此不需要引入 Service Worker**，也就不会与"基座默认关闭 PWA"的设定冲突。
代价是开始播放前要等整曲下载完（10–13MB），期间显示「正在载入…」。

## 4. 行为

- **打开**：只在 `mode === "detail"` 且当前档案是 `kind: "music"` 时打开；`await` 懒加载之后重新
  确认归属。详情里的「播放」按钮语义就是播放，所以传入 `autoplay`；浏览器若拦下（没有用户手势），
  状态栏提示「点「播放」开始」而不是报错——浮层里就有一个播放键。
- **单曲**：只放这一首，**没有曲目表、没有上一首/下一首、没有循环模式**。
  曲终回到开头并停下（状态显示「播放完毕」）。
- **进度**：可拖（Blob 保证 seek 真的生效）。音量独立于终端音效与背景音乐。
- **歌词**：按时间高亮当前行并平滑滚动到中部；纯音乐显示「纯音乐」占位，无歌词文件则显示提示。
- **键盘**：空格 播放/暂停，`←` / `→` 前后 5 秒（焦点在输入控件上时不接管），`ESC` 关闭。
- **关闭**：暂停播放 → 把背景 stem 交还 → 焦点归还入口按钮。退出动效有 600ms 兜底
  （动效完成回调来自 `animation.finished`，被节流的合成器可能永远不推进它）。

## 5. 验证

```bash
npm run check:features   # 模块边界（入口唯一、无跨功能穿透、宿主端口、无孤儿文件）
npm run typecheck
npm run build            # 统一构建（含 check:features）
```

数据侧断言在生成期（`build-lab-content.mjs`，失败即中断构建）：每条曲目的 `src` 与 `cover`
必须在 `public/music/` 真实存在；`migrate-content.mjs` 另校验"标为纯音乐却带 lrc"这种自相矛盾。
适配层再校验 `id` 唯一与 `src`/`cover` 是站内绝对路径。

⚠️ **浮层外观无法在沙箱里完整验证**（三维页持续 rAF，截图会卡死）——黑胶转动、歌词高亮位置
这类要真机目视；结构、文案、交互状态与"零 JS 异常"可以在无头浏览器里断言。
