// 生成 `apps/blog/src/lib/lunar-table.json` —— 农历年表（1900–2100）。
//
// ── 这是什么 ────────────────────────────────────────────────────────────
// 一张只含**天文历法事实**的表：每个公历年的春节日序、每个农历年的月序/月长/闰月、
// 24 节气在该公历年的日序。日历页用 `apps/blog/src/lib/lunar.ts`（自写算法）去消费它。
//
// ── 为什么需要这个脚本、又不把它接进依赖 ──────────────────────────────
// 手写农历年表靠记忆必错，而这里的事实是从一份**GPL-3.0**的既有实现（`js-calendar-converter`，
// 旧站用过）的**输出**里导出来的 —— 输出是事实、不是那份库的源码，所以本仓库（MIT）不因此
// 被传染。⚠️ 因此：**这份脚本不进 devDependencies、不进构建链**，只在需要重建年表时，
// 由本机临时装/借用那份 GPL 实现跑一次。
//
// ── 怎么用 ──────────────────────────────────────────────────────────────
//   CAL_PKG=<js-calendar-converter 所在目录> node verification/gen-lunar-table.cjs
// CAL_PKG 是"包含 js-calendar-converter 的 node_modules 的上一级"，例如旧站仓库根。
// 不填则默认找 `../endfield-blog`（旧站，本机对照用的内容来源）。
//
// ── 重建之后必须做的一件事 ────────────────────────────────────────────
//    node verification/diff-lunar.cjs        # 逐日对拍，必须 0 不一致
// 年表换掉而没对拍 = 拿日历的正确性赌博。

const fs = require("node:fs");
const path = require("node:path");

const REPO = path.resolve(__dirname, "..");
const base = process.env.CAL_PKG || path.resolve(REPO, "../endfield-blog");
const pkgDir = path.join(base, "node_modules", "js-calendar-converter");
if (!fs.existsSync(pkgDir)) {
  console.error(
    `找不到参考实现：${pkgDir}\n` +
      `这是**本机一次性**工具，需要临时备一份 GPL-3.0 的 js-calendar-converter（见文件头说明）。\n` +
      `可以用 CAL_PKG=<含有它的 node_modules 的上一级> 指定位置。`,
  );
  process.exit(1);
}
const lib = require(pkgDir);
const cal = lib.default ?? lib;

const FILE = path.join(REPO, "apps/blog/src/lib/lunar-table.json");
const START = 1900;
const END = 2100;
const TERM_ORDER = ["小寒","大寒","立春","雨水","惊蛰","春分","清明","谷雨","立夏","小满","芒种","夏至","小暑","大暑","立秋","处暑","白露","秋分","寒露","霜降","立冬","小雪","大雪","冬至"];

const doy = (y, m, d) => Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000) + 1;
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const probe = (y, m, d) => {
  const t = cal.solar2lunar(y, m, d);
  return t && t.lYear ? t : null;
};

// ── 春节（正月初一）在该公历年的日序 ──────────────────────────────────
const spring = [];
for (let y = START; y <= END; y++) {
  let found = null;
  for (let m = 1; m <= 12 && found === null; m++) {
    for (let d = 1; d <= daysIn(y, m); d++) {
      const t = probe(y, m, d);
      if (t && t.lMonth === 1 && t.lDay === 1 && !t.isLeap) { found = doy(y, m, d); break; }
    }
  }
  if (found === null) throw new Error(`${y} 没找到春节`);
  spring.push(found);
}

// ── 农历年的月序：闰月 + 每月天数（从本年春节走到下一年春节）─────────
const leap = [];
const months = [];
for (let y = START; y < END; y++) {
  // ★最后一年也要走完★：spring 覆盖到 END，所以 2099 的农历年能一直走到 2100 年的春节。
  // 早先这里把最后一年截在 2100-01-01，导致 2099 少一个月、2100 年那 356 天全对不上
  // （对拍抓出来的）。
  const from = Date.UTC(y, 0, 1) + (spring[y - START] - 1) * 86400000;
  const to = Date.UTC(y + 1, 0, 1) + (spring[y - START + 1] - 1) * 86400000;
  const seq = [];
  for (let t = from; t < to; t += 86400000) {
    const d = new Date(t);
    const info = probe(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    if (!info) break;
    const last = seq[seq.length - 1];
    if (!last || last.month !== info.lMonth || last.leap !== info.isLeap) {
      seq.push({ month: info.lMonth, leap: info.isLeap, days: 1 });
    } else {
      last.days += 1;
    }
  }
  leap.push(seq.find((s) => s.leap)?.month ?? 0);
  // 13 位定长：3 = 30 天，2 = 29 天（不足补 "0"，只有无闰月的年份会补）
  months.push(seq.map((s) => (s.days === 30 ? "3" : "2")).join("").padEnd(13, "0"));
}

// ── 24 节气在该公历年的日序 ──────────────────────────────────────────
const terms = [];
for (let y = START; y <= END; y++) {
  const seen = new Map();
  for (let m = 1; m <= 12; m++) {
    for (let d = 1; d <= daysIn(y, m); d++) {
      const t = probe(y, m, d);
      if (t && t.isTerm && t.Term) seen.set(t.Term, doy(y, m, d));
    }
  }
  const row = TERM_ORDER.map((name) => seen.get(name) ?? 0);
  // 1900 年的头两个节气落在参考数据起点（1900-01-31）之前，取不到 —— 只允许首年缺。
  if (y > START && row.some((v) => v === 0)) {
    throw new Error(`${y} 缺节气：${TERM_ORDER.filter((n) => !seen.has(n)).join(",")}`);
  }
  terms.push(row);
}

const out = {
  _note: "农历年表（1900–2100）：每年的春节日序、农历年月序/月长/闰月、24 节气日序。只含天文历法事实，由 verification/gen-lunar-table.cjs 一次性生成，并经 verification/diff-lunar.cjs 逐日对拍校验；不是任何库的源码。",
  range: [START, END],
  termOrder: TERM_ORDER,
  spring,
  leap,
  months,
  terms,
};
fs.writeFileSync(FILE, JSON.stringify(out), "utf8");
console.log(
  `年表已写出：${START}–${END} · spring ${spring.length} / leap ${leap.length} / months ${months.length} / terms ${terms.length} · ` +
    `${(fs.statSync(FILE).size / 1024).toFixed(1)} KB`,
);
console.log("⚠️ 接着跑 node --experimental-strip-types verification/diff-lunar.mjs 对拍，必须 0 不一致。");
