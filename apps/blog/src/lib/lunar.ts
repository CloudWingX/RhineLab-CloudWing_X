// 农历换算（自写，不引第三方库）。
//
// ── 为什么自己写 ────────────────────────────────────────────────────────
// 旧站用的是 `js-calendar-converter`，但那是 **GPL-3.0-or-later**，而本仓库是 MIT 模板 ——
// 谁 fork 都会连带把 GPL 拉进依赖图里。所以改成：**自己的算法 + 一张只含天文历法事实的数据表**
// （`lunar-table.json`：每年的月序/月长/闰月/春节日序/24 节气日序）。表由
// `verification/gen-lunar-table.cjs` 一次性生成，并**逐日对拍**校验过（见 docs/CALENDAR.md）——
// 表里是事实，不是任何库的源码。
//
// ── 覆盖范围 ────────────────────────────────────────────────────────────
// **1900-01-31 ~ 2100-02-08**（= 农历年 1900–2099）。再往后那一农历年走不完（生成表时的
// 数据边界停在 2100-12-31），所以到这里为止 —— 超界返回 null，由调用方决定怎么退化，不猜。
// 日历页只用「当年 −1 ~ +2」，离边缘很远。

// 带 import 属性：Node（对拍脚本）与 Vite/Astro 都认这个形式，仓库里已有先例。
import table from "./lunar-table.json" with { type: "json" };

const START = table.range[0];
const END = table.range[1];

/** 农历月的名字（闰月在外面加「闰」）。 */
const MONTH_CN = ["正月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "冬月", "腊月"];
const DAY_CN_TENS = ["初", "十", "廿", "卅"];
const DAY_CN_UNITS = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

/** 本站收录的节日（与旧站同一份白名单，控制信息密度）。 */
const LUNAR_FESTIVALS: Record<string, string> = {
  "1-1": "春节",
  "1-15": "元宵节",
  "2-2": "龙抬头",
  "5-5": "端午节",
  "7-7": "七夕节",
  "8-15": "中秋节",
  "9-9": "重阳节",
  "12-8": "腊八节",
};
const SOLAR_FESTIVALS: Record<string, string> = {
  "1-1": "元旦",
  "5-1": "劳动节",
  "6-1": "儿童节",
  "10-1": "国庆节",
};
/** 收录的节气（旧站只收这两个）。 */
const TERMS = new Set(["清明", "冬至"]);

export interface LunarDay {
  lYear: number;
  lMonth: number;
  lDay: number;
  isLeap: boolean;
  /** 农历月名（初一显示它） */
  monthCn: string;
  /** 农历日名（其余日子显示它） */
  dayCn: string;
  /** 白名单内的节气名 */
  term: string | null;
  /** 白名单内的农历节日名 */
  lunarFestival: string | null;
  /** 白名单内的公历节日名 */
  solarFestival: string | null;
}

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
/** 给定公历年月日 → 距 UTC 纪元的天数（只用做减法，避免时区干扰）。 */
const dayNumber = (y: number, m: number, d: number) => Math.round(Date.UTC(y, m - 1, d) / 86400000);

/** 农历年的月序：[{月, 是否闰, 天数}]，闰月紧跟同号月之后。 */
function monthSequence(lunarYear: number) {
  const index = lunarYear - START;
  if (index < 0 || index >= table.months.length) return null;
  const leapMonth = table.leap[index];
  const lengths = table.months[index];
  const sequence: { month: number; isLeap: boolean; days: number }[] = [];
  for (let month = 1; month <= 12; month += 1) {
    const flat = lengths[sequence.length];
    if (flat === undefined || flat === "0") break;
    sequence.push({ month, isLeap: false, days: flat === "3" ? 30 : 29 });
    if (leapMonth === month) {
      const leapFlat = lengths[sequence.length];
      if (leapFlat === undefined || leapFlat === "0") break;
      sequence.push({ month, isLeap: true, days: leapFlat === "3" ? 30 : 29 });
    }
  }
  return sequence;
}

const dayCn = (day: number) =>
  // 十、二十、三十是整十的特殊写法（注意「初十」而不是「十」—— 对拍抓出来的）
  day === 10
    ? "初十"
    : day === 20
      ? "二十"
      : day === 30
        ? "三十"
        : `${DAY_CN_TENS[Math.floor(day / 10)]}${DAY_CN_UNITS[day % 10]}`;

/**
 * 公历 → 农历。超出年表范围（1900-01-31 之前 / 2100-12-31 之后）返回 null。
 */
export function solarToLunar(year: number, month: number, day: number): LunarDay | null {
  const index = year - START;
  if (index < 0 || index >= table.spring.length) return null;

  // 该日属于哪个农历年：早于本年的春节 → 归上一个农历年。
  const dayOfYear = dayNumber(year, month, day) - dayNumber(year, 1, 1) + 1;
  const lunarYear = dayOfYear >= table.spring[index] ? year : year - 1;
  const sequence = monthSequence(lunarYear);
  if (!sequence) return null;

  const fromSpring = dayNumber(year, month, day) - dayNumber(lunarYear, 1, table.spring[lunarYear - START]);
  if (fromSpring < 0) return null;
  let offset = fromSpring;
  let hit = null;
  for (const entry of sequence) {
    if (offset < entry.days) {
      hit = { ...entry, day: offset + 1 };
      break;
    }
    offset -= entry.days;
  }
  if (!hit) return null;

  const termIndex = table.terms[index]?.indexOf(dayOfYear) ?? -1;
  const term = termIndex >= 0 ? table.termOrder[termIndex] : null;
  // 除夕 = 腊月的最后一天（不是固定的二十九/三十）。
  const last = sequence[sequence.length - 1];
  const isNewYearEve = !hit.isLeap && hit.month === 12 && hit.day === last.days;

  return {
    lYear: lunarYear,
    lMonth: hit.month,
    lDay: hit.day,
    isLeap: hit.isLeap,
    monthCn: `${hit.isLeap ? "闰" : ""}${MONTH_CN[hit.month - 1]}`,
    dayCn: dayCn(hit.day),
    term: term && TERMS.has(term) ? term : null,
    lunarFestival: isNewYearEve
      ? "除夕"
      : (LUNAR_FESTIVALS[`${hit.month}-${hit.day}`] ?? null),
    solarFestival: SOLAR_FESTIVALS[`${month}-${day}`] ?? null,
  };
}

/**
 * 日历格子上显示什么：节日 > 节气 > （初一显示月名，其余显示日名）。
 * 与旧站同一套优先级，kind 用来上色（1 = 节日，2 = 节气，0 = 普通）。
 */
export function cellLabel(lunar: LunarDay): { label: string; kind: 0 | 1 | 2 } {
  if (lunar.lunarFestival) return { label: lunar.lunarFestival, kind: 1 };
  if (lunar.solarFestival) return { label: lunar.solarFestival, kind: 1 };
  if (lunar.term) return { label: lunar.term, kind: 2 };
  return { label: lunar.lDay === 1 ? lunar.monthCn : lunar.dayCn, kind: 0 };
}
