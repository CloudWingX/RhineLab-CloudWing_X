# 文档索引

本目录是模板的**操作与参考手册**：把开发过程中形成的结论、契约与参数整理成描述当前实现、
约定与操作方式的说明。历史开发文档已总结为本目录与仓库根的入口文档，不再单独分发过程记录。

仓库根的三个入口文档与本文互补：[README](../README.md)（定位与快速开始）、
[AGENTS](../AGENTS.md)（协作约束）、[BLOG-MAINTAIN-PERFECT.md](../BLOG-MAINTAIN-PERFECT.md)（维护手册）。

## 文档一览

| 文档 | 内容 |
| --- | --- |
| [FEATURES.md](FEATURES.md) | 功能模块划分：相对上游新增功能的清单、宿主端口与门面、边界规则、增删一个功能的完整流程 |
| [HANDOFF.md](HANDOFF.md) | **交接记录**：项目现状、提交清单与未完成项、待真机确认的两处、构建与验证、环境约束、关键文件地图 |
| [AUTHORING.md](AUTHORING.md) | 写作与内容维护：目录约定、frontmatter 字段、草稿与未来文章、URL 与重定向、三维主题映射、常见问题 |
| [BUILD.md](BUILD.md) | 构建与发布：环境准备、构建顺序、本地预览、资源白名单、release 打包与激活、回滚、健康检查、排障 |
| [READER.md](READER.md) | 沉浸式全文阅读：模块职责、页面契约、窗口与布局参数、控件与目录导航、内容白名单与安全、滚动恢复、验证命令 |
| [CALENDAR.md](CALENDAR.md) | 日历页：三份数据来源、为什么自写农历换算（GPL 规避）与逐日对拍、窗口边界、每年要改的一处 |
| [ALBUM.md](ALBUM.md) | 影像档案（图集）查看器：两个大类与档案记录的关系、数据来源、模块职责、行为与验证 |
| [MUSIC.md](MUSIC.md) | 音乐档案与播放器：曲目数据与素材、模块职责、Blob 播放的理由、歌词同步、验证 |
| [UPSTREAM.md](UPSTREAM.md) | 上游来源与署名：只读远端配置、相对上游的差异、第三方资源与许可、处理上游更新的原则 |
| [fonts/README.md](fonts/README.md) | 字体来源、许可与重建方式（MiSans 正文/UI、JetBrains Maple Mono 代码） |
| [media/README.md](media/README.md) | 界面截图与动图的采集记录与用途 |
| [../SANITIZE-NOTES.md](../SANITIZE-NOTES.md) | 本模板的脱敏范围、替换规则与残留边界 |

## 阅读顺序建议

- **要写文章**：[AUTHORING.md](AUTHORING.md) → [content/README.md](../content/README.md)
- **刚接手这个项目**：[HANDOFF.md](HANDOFF.md) → [FEATURES.md](FEATURES.md) → [BUILD.md](BUILD.md)
- **要部署上线**：[BUILD.md](BUILD.md) → [BLOG-MAINTAIN-PERFECT.md](../BLOG-MAINTAIN-PERFECT.md)
- **要增删功能模块**：[FEATURES.md](FEATURES.md) → [src/features/README.md](../src/features/README.md)
- **要改阅读层**：[READER.md](READER.md) → `src/features/reader/` 与 `scripts/reading/`
- **要改影像档案（图集）**：[ALBUM.md](ALBUM.md) → `src/features/album-viewer/` 与
  `content/gallery.json`
- **要改音乐档案/播放器**：[MUSIC.md](MUSIC.md) → `src/features/music-player/` 与
  `content/music.json`
- **要改日历页**：[CALENDAR.md](CALENDAR.md) → `content/calendar.json`、
  `apps/blog/src/lib/calendar-data.ts`
- **要同步上游或调整素材**：[UPSTREAM.md](UPSTREAM.md)
