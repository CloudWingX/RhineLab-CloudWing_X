# 网站导航（三维阵列里的一个列）

旧站的「网站导航」（`/nav/`，21 个站点 / 6 个分组）搬过来了 —— **结构与影像档案完全同构**：

| 说法 | 系统里的东西 |
| --- | --- |
| 大类 | 档案记录的 `category`：**`网站导航`** —— 它是阵列里的**一列** |
| 一条档案 = 一个分组（小类） | 一条 `kind: "siteGroup"` 的记录，例如 `X-065`（AI 与云服务） |
| 档案记录页 | `#detail-ui` 档案详情面板（`renderDetail` 的 siteGroup 分支） |
| 浏览按钮 | 详情面板操作区的 `[data-action="open-site-viewer"]` |
| 站点界面 | `src/features/site-viewer/` 的居中浮层（卡片墙） |

> 设计修正（2026-09-26）：最初做成了"每个分组一列"（阵列 14 列），**那是错的** ——
> 站长要的是「网站导航」作为一个大类占一列，列里的每条档案才是分组。
> 现在是 **9 列**：5 文章主题 + 2 影像大类 + 音乐 + **网站导航**。

## 1. 数据从哪来

| 层 | 位置 |
| --- | --- |
| 数据源 | `content/nav.json`（`groups[]`，6 分组 / 21 条目：`name` / `href` / `desc` / `tag` / `icon`） |
| 生成 | `scripts/blog/build-lab-content.mjs` → `.generated/lab-content.json` 的 `records`（`kind: "siteGroup"`）+ `columns` |
| 适配与校验 | `src/blog-adapter.ts`（`LabSiteGroupSlot` / `SiteItem`：条目非空、`count` 对得上、`url` 是 http(s)、`icon` 是站内绝对路径） |
| 图标 | `apps/blog/public/nav/`（21 个，108 KB，**自托管**） |
| 详情面板 | `src/main.ts`（`renderDetail` 的 siteGroup 分支） |
| 浮层 | `src/features/site-viewer/`（与 album-viewer 同构：宿主端口 + 门面 + 懒加载） |

**每列仍恰好 8 槽**（与其余列同一规则）：6 个分组 → 补到 8 槽，前两个分组各重复一次，
共 8 条档案。加一个分组就往 `groups` 里加一段；某段删空则该条档案不出现。

## 2. 图标：自托管，且与首字互斥

`icon` 是**站内路径**，浮层不发任何外部请求（旧站刻意不用第三方 favicon 服务）。
生成期会 `stat` 每个图标：**缺文件直接构建失败** —— 否则只会在浮层里留下一个破图标，
那是最难被发现的一类坏数据。

★两条约定★（都是从旧站导航页照搬的）：

1. **图标与首字互斥**：给了图标就只画图标，DOM 里**不留首字**。CSS 无法感知背景图有没有加载
   成功，留着的首字会在图标透明处透出来，看起来像两个图标叠在一起。
2. 没给图标 → 用站名首字拼一个圆牌（`--site-icon` 为空时 `background-image` 无效，自然不画图）。

## 3. 详情面板与浮层

详情面板与其余四类档案共用同一版式，只有内容按 `kind` 分叉：

- **元数据**：`CATEGORY / 大类`（网站导航）、`SITES / 收录`、`HINT / 说明`、`STATUS / 状态`
- **页签**：`01 概述`、`02 收录站点`（站点清单，与影像档案的「收录影像」同一版式）、`03 访问日志`
- **操作区**：`[收藏][浏览站点]` —— 与影像档案的 `[收藏][查看详情]` 同构
- **浮层**：卡片墙（自适应列数），每张卡是外链（新标签 + `rel="noopener noreferrer"`）；
  `ESC`、右上 `CLOSE`、点遮罩空白处都能关；退出动效有 600ms 兜底（与影像查看器同因）。

⚠️ 站点被点击时**不会**被阅读层截走：`READER_ENTRY_SELECTOR` 只认
`[data-action="read-immersive"]`，而卡片是普通外链。

## 4. 旧地址

旧站 `/nav/` 现在 **301 到 `/lab/`**（与 `/gallery/`、`/music/` 一致，站长 2026-09-26 定）。

## 5. 验证

```bash
npm run check:imports     # 相对导入
npm run check:features    # 功能边界（site-viewer 是第 4 个功能模块）
npm run check:content
npm run build             # 生成器校验每个站点的 href 与 icon；check:site 核对图标进了产物
```

⚠️ 阵列里这一列的**实际外观**（第 9 列的位置与构图）、以及浮层卡片墙的排布需要真机目视。
