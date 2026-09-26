// 逐日对拍：`apps/blog/src/lib/lunar.ts`（本仓库自写）vs 一份 GPL-3.0 的既有实现。
//
// 判据是**日历格子上真正显示的那两个值**：标签（节日/节气/农历日）+ 种类（0/1/2）。
// 覆盖 1900-01-31 ~ 2100-02-08 每一天（= 农历年 1900–2099，年表的真实边界）。
//
// 为什么值得留着：这份自写实现是**手写的历法算术**，年表又是从别处导出的 —— 两者都可能错。
// 这个脚本是它们的完整判据：任何一天对不上就报出来（实测已经靠它抓到两个 bug：
// 「初十」写成「十」、以及年表最后一年被截断）。
//
// 用法：
//   node --experimental-strip-types verification/diff-lunar.mjs
//   CAL_PKG=<含有 js-calendar-converter 的 node_modules 的上一级> node --experimental-strip-types … …
// ⚠️ 与 gen-lunar-table.cjs 一样：参考实现是 **GPL-3.0**，只在本机临时借用，不进依赖。

import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.CAL_PKG || resolve(REPO, "../endfield-blog");
const pkgDir = join(base, "node_modules", "js-calendar-converter");
if (!existsSync(pkgDir)) {
  console.error(`找不到参考实现：${pkgDir}（本机一次性工具，见文件头说明；可用 CAL_PKG 指定）`);
  process.exit(1);
}

const require = createRequire(import.meta.url);
const lib = require(pkgDir);
const cal = lib.default ?? lib;
const mine = await import(join(REPO, "apps/blog/src/lib/lunar.ts"));

// 旧站日历页里的那段取舍逻辑，逐字照抄 —— 这才是"同一口径"。
const LUNAR_FESTS = new Set(["春节", "除夕", "元宵节", "龙抬头", "端午节", "七夕节", "中秋节", "重阳节", "腊八节"]);
const SOLAR_FESTS = new Set(["元旦节", "劳动节", "儿童节", "国庆节"]);
const TERMS = new Set(["清明", "冬至"]);
const renameSolar = (t) => (t === "元旦节" ? "元旦" : t);

function reference(y, m, d) {
  const lu = cal.solar2lunar(y, m, d);
  if (!lu || !lu.lYear) return null;
  const lf = lu.lunarFestival && LUNAR_FESTS.has(lu.lunarFestival) ? lu.lunarFestival : null;
  const sf = lu.festival && SOLAR_FESTS.has(lu.festival) ? renameSolar(lu.festival) : null;
  const tm = lu.isTerm && TERMS.has(lu.Term) ? lu.Term : null;
  if (lf) return { label: lf, kind: 1 };
  if (sf) return { label: sf, kind: 1 };
  if (tm) return { label: tm, kind: 2 };
  return { label: lu.lDay === 1 ? lu.IMonthCn : lu.IDayCn, kind: 0 };
}

let checked = 0;
let mismatches = 0;
const samples = [];
for (let t = Date.UTC(1900, 0, 31); t <= Date.UTC(2100, 1, 8); t += 86400000) {
  const date = new Date(t);
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  const want = reference(y, m, d);
  const lunar = mine.solarToLunar(y, m, d);
  const got = lunar ? mine.cellLabel(lunar) : null;
  checked += 1;
  if (!want || !got || want.label !== got.label || want.kind !== got.kind) {
    mismatches += 1;
    if (samples.length < 12) {
      const key = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      samples.push(`${key}  期望 ${want ? `${want.label}/${want.kind}` : "null"}  实得 ${got ? `${got.label}/${got.kind}` : "null"}`);
    }
  }
}

console.log(`农历对拍 ${checked} 天（1900-01-31 ~ 2100-02-08）· 不一致 ${mismatches} 天`);
for (const line of samples) console.log("  ✗", line);
process.exit(mismatches ? 1 : 0);
