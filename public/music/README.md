# 音乐目录

`/lab/` 三维终端的音乐播放器（`src/features/music-player/`）用这里的文件。

**曲目数据不在这里维护**：唯一事实来源是 `content/music.json`（由 `scripts/migrate-content.mjs`
从旧站 `src/site.ts` 的 `MUSIC` 数组生成）。这里只放文件：

    <id>.mp3            音频（320kbps MP3 —— CF Pages 单文件 25MB 上限，原无损 FLAC 无法直接部署）
    covers/<id>.jpg     封面（黑胶唱片中心的 label）
    lyrics/<id>.lrc     歌词（存在即自动同步高亮；纯音乐不需要）

约定：

- 文件名用**英文/数字**（`<id>.mp3`），避免中文与空格的 URL 编码问题；
- 歌词是标准 LRC（`[mm:ss.xx] 文本`），**不写进 JSON** —— 少一个文件就自然退化成"纯音乐"，
  免得数据与文件两处打架（`migrate-content.mjs` 会校验这一点：标为纯音乐却带 lrc 会直接报错）；
- ⚠️ **新增文件必须能被 `scripts/blog/prepare-assets.mjs` 的白名单扫到**。
  `/lab/` 的 publicDir 是 `.generated/lab-public`，**只收白名单里的文件**；
  漏登记的表现是"播放器没声音"而不是构建失败。脚本用 `musicFiles("music")` 整棵树发现，
  所以新增曲目通常不用手改白名单——但**新增目录层级时要确认它被扫到**。

## 关于 seek：为什么这里没有 Service Worker

CF Pages 的静态资产**不支持 Range 请求**，浏览器媒体栈对不可 Range 的资源会把 seek 钳回 0
（点进度条 ≈ 重头播放）。旧站的做法是加一个 Service Worker 拦截 `/music/*.mp3` 的 Range 请求。

**本站不这么做**：播放器打开一曲时把整曲 `fetch` 成 Blob，再让 `audio.src` 指向 blob URL ——
本地 blob 天然可 seek，因此**不需要引入 SW**，也就不会与"基座默认关闭 PWA"的设定冲突。
代价是开始播放前要等整曲下载完（10–13MB），期间显示「正在载入…」。

## 版权

4 首均为**商业发行音乐**（V.K克 / SawanoHiroyuki[nZk] / supercell），**不随站点授权**，
仅供站内欣赏。封面为各专辑官方封面（Deemo 合辑 / Avid·Hands Up to the Sky / 魔法使いの夜 OST），
歌词为 LRCLIB 社区同步歌词。
