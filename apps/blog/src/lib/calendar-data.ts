// 日历页的**数据组装**（构建期一次算好，内联给客户端渲染）。
//
// 单独成模块而不是写在页面 frontmatter 里，是为了**能在沙箱里直接跑着验**：
// 页面只负责渲染，逻辑在这里（含窗口、边界、节假日展开、更新标记聚合）。
//
// 三份输入：
//   1. `apps/blog/src/lib/lunar-table.json` —— 农历年表（天文事实，见 lunar.ts 的说明）
//   2. `content/calendar.json`              —— 法定节假日与调休（国务院通知，站长每年补一次）
//   3. 更新档案的日期与条数                  —— 由页面从文章里算好传进来（本模块保持纯粹）

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { solarToLunar, cellLabel } from "./lunar.ts";

/** 日历页渲染用的全部数据（会被 JSON 内联进页面，字段名保持短）。 */
export interface CalendarPayload {
  /** 数据起点：年、月 */
  y0: number;
  m0: number;
  /** 数据终点：年（含 12 月） */
  y1: number;
  /** 逐日的农历/节日标签（与 kinds 一一对应） */
  labels: string[];
  /** 逐日的种类：1 = 节日，2 = 节气，0 = 普通 */
  kinds: string;
  /** 法定假期与调休：ISO 日期 → [off|on, 名称] */
  holiday: Record<string, [string, string]>;
  /** 站点更新：ISO 日期 → 当日改动条数 */
  log: Record<string, number>;
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** 内容侧根目录：与 `src/content.config.ts` 同一套约定（相对 apps/blog 的工作目录）。 */
const contentRoot = () => process.env.BLOG_CONTENT_ROOT || resolve("../../content");

interface CalendarFile {
  holidays: { name: string; from: string; to: string }[];
  workdays: string[];
}

/**
 * 读并校验 `content/calendar.json`。站长每年只改这一个文件，所以出错必须指名道姓。
 */
export function loadCalendarFile(): CalendarFile {
  const file = resolve(contentRoot(), "calendar.json");
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`读不到或解析不了 ${file}：${(error as Error).message}`);
  }
  const data = raw as Partial<CalendarFile>;
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!Array.isArray(data.holidays) || !Array.isArray(data.workdays)) {
    throw new Error(`${file} 必须是 { holidays: [...], workdays: [...] }`);
  }
  for (const [i, item] of data.holidays.entries()) {
    if (!item?.name || !datePattern.test(item.from ?? "") || !datePattern.test(item.to ?? "")) {
      throw new Error(`${file} 的 holidays[${i}] 需要 name 与 YYYY-MM-DD 形式的 from/to`);
    }
    if (item.from > item.to) {
      throw new Error(`${file} 的 holidays[${i}]（${item.name}）from 晚于 to`);
    }
  }
  for (const [i, day] of data.workdays.entries()) {
    if (!datePattern.test(day)) throw new Error(`${file} 的 workdays[${i}] 不是 YYYY-MM-DD：${day}`);
  }
  return { holidays: data.holidays, workdays: data.workdays };
}

/** 假期区间 + 调休日 → 逐日映射（假期优先：同一天既放假又调休不合逻辑，报出来）。 */
function holidayMap(file: CalendarFile): Record<string, [string, string]> {
  const map: Record<string, [string, string]> = {};
  for (const item of file.holidays) {
    for (let t = Date.parse(`${item.from}T00:00:00Z`); t <= Date.parse(`${item.to}T00:00:00Z`); t += 86400000) {
      const key = new Date(t).toISOString().slice(0, 10);
      if (map[key]) throw new Error(`content/calendar.json：${key} 同时属于「${map[key][1]}」与「${item.name}」`);
      map[key] = ["off", item.name];
    }
  }
  for (const day of file.workdays) {
    if (map[day]) throw new Error(`content/calendar.json：${day} 既是假期又是调休上班`);
    map[day] = ["on", "调休上班"];
  }
  return map;
}

/** 更新记录里「改动条数」的口径：正文里的列表项（与旧站 changelog 的条数同义）。 */
export function countChanges(body: string): number {
  return (body.match(/^\s*[-*]\s+\S/gm) ?? []).length;
}

/**
 * 组装日历页的数据。
 *
 * ★窗口 = 构建年 −1 ~ +2★（旧站是写死 2025–2027）：自动跟随、不用人维护。
 * 客户端只能在窗口内翻月（‹ › 到边界会禁用），窗口外没有数据也就不猜。
 */
export function buildCalendarPayload(options: {
  year: number;
  updates?: { date: string; count: number }[];
}): CalendarPayload {
  const y0 = options.year - 1;
  const y1 = options.year + 2;
  const labels: string[] = [];
  // 逐日的种类压成一个字符串（1 = 节日，2 = 节气，0 = 普通）—— 比数组省一半体积，
  // 客户端 `DATA.kinds[idx]` 取单个字符即可。
  let kinds = "";

  for (let y = y0; y <= y1; y += 1) {
    for (let m = 1; m <= 12; m += 1) {
      const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
      for (let d = 1; d <= dim; d += 1) {
        const lunar = solarToLunar(y, m, d);
        if (!lunar) throw new Error(`农历年表覆盖不到 ${iso(y, m, d)} —— 需要重新生成 lunar-table.json`);
        const { label, kind } = cellLabel(lunar);
        labels.push(label);
        kinds += String(kind);
      }
    }
  }

  const log: Record<string, number> = {};
  for (const { date, count } of options.updates ?? []) {
    if (count > 0) log[date] = count;
  }

  return { y0, m0: 1, y1, labels, kinds, holiday: holidayMap(loadCalendarFile()), log };
}
