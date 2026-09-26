# 构建与发布

本站采用**本机构建 + 不可变 release + 服务器只接收激活**的方式：构建永不发生在服务器上，
上传或打包完成不等于发布完成，任一步失败都不会替换线上。

## 1. 环境准备

- Node.js ≥ 22.12（开发环境 24.14.0）、npm 11.x；版本以 `package-lock.json` 为准。
- 依赖安装：`npm ci --ignore-scripts`（官方 registry 连接不畅时可加 `--registry=https://registry.npmjs.org`）。

## 2. 构建顺序

`npm run build` 按固定顺序执行八步，后续步骤不会清空前序产物：

| 顺序 | 命令 | 作用 |
| --- | --- | --- |
| 1 | `npm run check:imports` | 相对导入静态解析：`src/` 与 `apps/blog/src` 的每条相对路径都能解析到真实文件 |
| 2 | `npm run check:content` | 内容 schema、路径唯一性、保留路由、封面、主题引用 |
| 3 | `npm run check:features` | 功能模块边界：清单一致、入口唯一、无跨功能穿透、无孤儿文件 |
| 4 | `npm run build:blog` | 先 `prepare:assets` 暂存白名单资源，再由 Astro 输出到 `dist/` |
| 5 | `npm run build:lab` | Vite 构建 `/lab/` 到 `dist/lab/`（阅读层与它的 CSS 为独立懒加载 chunk） |
| 6 | `npm run build:redirects` | 生成 `dist/_redirects`（消费 `legacyUrls` + 站级规则，含根路径的 200 rewrite） |
| 7 | `npm run search:index` | Pagefind 生成全文检索索引到 `dist/pagefind/` |
| 8 | `npm run check:site` | 产物完整性、未公开内容泄露、`/lab/` 边界、404 与 RSS/sitemap、档案下载件 |

其中 `generate:lab-content`（构建链开头、以及 `prepare:assets` 里都会跑）除了生成三维内容目录，
还会生成档案下载件（`scripts/blog/export-archives.mjs`，见 §4）。

单独执行某一步：

```bash
npm run check:imports
npm run check:content
npm run check:features
npm run build:blog
npm run build:lab
npm run build:redirects
npm run search:index
npm run check:site
npm run typecheck          # 相对导入 + 三维 TypeScript 检查
```

> **Windows 提示**：`npm run build` 通过 `spawnSync` 拉起各步 npm 子进程。若运行环境禁止子进程
> 管道（部分沙箱/受限终端），编排会以 `exit null` 失败——此时按上表逐条执行即可，产物完全一致。

## 3. 本地预览

```bash
npm run preview            # 默认 http://127.0.0.1:4173
npm run preview 8080       # 指定端口
```

预览服务直接读 `dist/`：目录请求补 `index.html`，**未知路径返回真实 404**（没有 SPA 回落）。
`preview.mjs` 只监听 `127.0.0.1`；需要用手机在同网段测试时，把监听地址改成 `0.0.0.0` 后重启。

预览还会读产物里的 `dist/_redirects`（构建时由 `build-redirects.mjs` 生成），语义与 CF Pages 对齐：
**301/302 优先于静态文件、200（rewrite）让位于静态文件**。站点开屏 —— 根 `/` 用 200 rewrite 直接
交给三维终端、地址栏保持 `/` —— 就靠这条规则，预览不认它的话本地访问 `/` 会 404。
只实现精确路径与结尾 `*` 的前缀匹配；CF 的 `:placeholder` 等写法本项目没有用到。

## 4. 资源白名单

`prepare:assets` 只把白名单内的资源复制进发布产物（字体分片、图标、`wp-content` 上传件等），
并会清理托管子树中不在白名单里的旧字体文件。因此：

- 新增需要发布的静态资源，要同时加入 `scripts/blog/prepare-assets.mjs` 的白名单；
  （档案下载件 `public/archives/` 就是这种：它整棵由 `scripts/blog/export-archives.mjs` 生成、
  不入库，靠白名单原样收录。**漏登记的症状是详情面板的导出按钮 404** —— lab 的 publicDir
  每次构建都会重建，不在白名单里的会被 `rm` 掉。）
- 反向代理、CDN 或子路径部署时，必须保证 CSS 字体、GLB、图标与 HTML 链接都被覆盖。

## 5. 打包与发布

```bash
cp ops/upload.env.example ops/upload.env     # 填 SSH_HOST / SSH_USER / SSH_IDENTITY / DEPLOY_ROOT
ID="$(date -u +%Y%m%dT%H%M%SZ)-$(git rev-parse --short HEAD)"
npm run release -- --id "$ID"                # 生成 release/<id>/ 站点包与清单
bash ops/upload-release.sh --id "$ID" --activate
```

Windows 可用 `ops/upload-release.ps1 -HostName <host> -UserName root -ReleaseId <id> -Activate`。

流程与保障：

1. `package-release` 产出站点 tarball、文件清单与校验和，并写入 `release.json`（含版本、git sha、
   文件数与归档哈希）。
2. 上传到服务器 `incoming/`，服务器侧校验后解包到 `releases/<id>/`。
3. `--activate` 原子切换 `active` 软链，执行 `nginx -t` 通过后 reload，并记录状态。
4. `releases/` 按 `KEEP_RELEASES` 保留最近若干版本；旧版本始终可回滚。
5. 服务器**不安装 Node、不在线上编译、不 `git pull` 覆盖**。

## 6. 发布后验证与回滚

```bash
node ops/smoke-test.mjs https://example.com    # 期望 10/10
curl -s  https://example.com/release.json      # 核对 releaseId 与 active 一致
curl -sI https://example.com/ | head
```

回滚一个静态版本：

```bash
ssh root@203.0.113.10 "DEPLOY_ROOT=/srv/example-blog bash /srv/example-blog/ops/rollback-release.sh <旧release-id>"
```

回滚后确认 `active` 指向、`/release.json` 内容与页面状态码，并重跑 smoke。

## 7. 健康检查与定时任务

`ops/healthcheck.sh` 校验站点与入口状态码、未知路径 404、unit 状态、近一小时 5xx、
证书剩余天数、根分区占用与 active release 一致性，结果写入 `state/health.json`。
`ops/systemd/` 提供备份与健康检查两个 unit 模板；安装后 `systemctl enable --now` 即可。
默认告警只有 journal 与状态文件，需要邮件/Webhook 需另行接入。

## 8. 排障

| 现象 | 排查 |
| --- | --- |
| 整站 403 | release 目录权限；目录 `755`、文件 `a+rX` |
| 未知路径返回首页 200 | 检查 `try_files ... =404`；确认没有 SPA 回落 |
| 中文标点后的 `**加粗**` 不渲染 | 确认 `apps/blog/astro.config.mjs` 启用了 `remark-cjk-friendly` |
| 字体 404 | 资源白名单未包含该文件，或子路径部署时 `/fonts/` 未被覆盖 |
| `nginx -t` 失败 | 先不要 reload；回滚 vhost 备份后重试 |
| 证书过期 | 检查续期任务与 80 端口 ACME 路径可达性 |
| 磁盘满 | 清理旧 release 与旧备份；用 `du -sh` 定位 |
| 发布后未生效 | `readlink active`、`/release.json`、reload 是否成功 |
| 构建在第一步失败 | 内容校验未通过；按 `check:content` 的报错修正 frontmatter |

## 9. 相关文档

- [docs/README.md](README.md)：文档索引
- [AUTHORING.md](AUTHORING.md)：写作与内容维护
- [../BLOG-MAINTAIN-PERFECT.md](../BLOG-MAINTAIN-PERFECT.md)：维护手册（含备份、监控与安全约束）
- [../ops/upload.env.example](../ops/upload.env.example)：部署配置项示例
