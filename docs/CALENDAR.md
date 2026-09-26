# 日历页（`/calendar/`）

月历 + 农历/节气/节日 + 法定节假日与调休 + 站点更新标记。**三份数据都在构建期算好、内联进页面**，
访客端零请求、零外部依赖。

## 1. 数据从哪来

| 层 | 位置 | 说明 |
| --- | --- | --- |
| 农历年表 | `apps/blog/src/lib/lunar-table.json` | 只含天文历法事实：每年的春节日序、农历年月序/月长/闰月、24 节气日序。1900–2100 |
| 换算算法 | `apps/blog/src/lib/lunar.ts` | **自写**（见 §2）。公历 → 农历/节气/节日，以及格子上显示什么 |
| 法定节假日与调休 | `content/calendar.json` | 国务院办公厅通知（gov.cn），站长每年补一次（见 §4） |
| 站点更新标记 | 更新档案那一类文章 | 按发布日聚合；条数取正文里的列表项 |
| 组装 | `apps/blog/src/lib/calendar-data.ts` | 窗口、边界、`content/calendar.json` 的校验。单独成模块是为了**能在沙箱里跑着验** |

## 2. ★为什么农历换算自己写★

旧站用的是 `js-calendar-converter`，但那是 **GPL-3.0-or-later**，而本仓库是 **MIT 模板** ——
谁 fork 都会把 GPL 拉进依赖图里。所以改成"**自写算法 + 一张只含天文事实的年表**"：

- 年表由 `verification/gen-lunar-table.cjs` 从那份实现的**输出**里导出（输出是事实，不是它的源码）；
- 算法（`lunar.ts`）自己写；
- 那份 GPL 实现**只在本机临时借用，绝不进 `devDependencies`、不进构建链**。

**重建年表之后必须对拍**：

```bash
node verification/gen-lunar-table.cjs                        # 需要本机有一份 GPL 参考实现（见脚本头）
node --experimental-strip-types verification/diff-lunar.mjs   # ★必须 0 不一致★
```

判据是**日历格子上真正显示的那两个值**（标签 + 种类），覆盖 1900-01-31 ~ 2100-02-08 每一天。
实测 **73058 天 · 0 不一致**。它已经抓到过两个真 bug：「初十」被写成「十」、年表最后一年被截断 ——
**没有对拍，这两个会直接上线**。

## 3. 窗口与边界

**窗口 = 构建年 −1 ~ +2**（取 `BUILD_NOW` 的年份；旧站是写死 2025–2027，所以这里是自动跟随）。
客户端只能在窗口内翻月：`‹` `›` 到边界禁用，`今天` 越界时落回边界月。

年表的真实覆盖是**农历年 1900–2099**；再往后 `solarToLunar` 返回 `null`（**不猜**），
`buildCalendarPayload` 撞上会直接抛错 —— 宁可构建失败，也不要静默画错日子。

## 4. 每年要改的一处

`content/calendar.json`。每年 11 月前后国务院办公厅公布下一年安排后，补一段 `holidays`
（`{ name, from, to }`）与 `workdays`（调休上班的日期）即可 —— 日历页会自己跟着变。
写错会在构建期报明确的错：日期格式不对、`from` 晚于 `to`、同一天既放假又调休，都会指名道姓。

## 5. 渲染

月历网格**由客户端按访客本地「今天」渲染**（沿用旧站做法）：构建时间与访问时间解耦，任何月份都能
翻、不发请求。页面里的内联脚本挂在 `DOMContentLoaded` —— 本基座**没有 View Transitions**，
所以没有 `astro:page-load` 可用（旧站有）。

样式在 `apps/blog/src/styles/blog.css` 的「日历页」一节，只用站点令牌（`--ink` / `--paper` /
`--accent` / `--rule` / `--muted` / `--font-mono`），假期与调休的底色由 `color-mix` 从令牌混出，
换强调色会跟着变。

## 6. 验证

```bash
npm run check:imports     # 相对导入（页面与两个 lib 都在扫描范围内）
npm run check:content
npm run build             # 构建链末尾的 check:site 会核对 calendar/index.html 在产物里
node --experimental-strip-types verification/diff-lunar.mjs   # 农历逐日对拍
```

⚠️ 月历的**实际外观**（格子、徽标位置、翻月手感）需要真机目视 —— 沙箱里验不了。
