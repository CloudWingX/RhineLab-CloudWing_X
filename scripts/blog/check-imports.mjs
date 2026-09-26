// 相对导入静态解析：把"搬家 / 改名之后忘了改相对路径"这类错误提前抓出来。
//
// ── 为什么需要它 ────────────────────────────────────────────────────────
// 2026-09-26 实测踩到：把 `apps/blog/src/pages/index.astro` 搬到 `pages/blog/` 之后，
// 里面的 `../layouts/BaseLayout.astro` 少退了一级，`astro build` 在 `build:blog` 那一步
// 直接 UNRESOLVED_IMPORT 失败。而这个错 **`npm run typecheck` 抓不到**：
//   根 `tsconfig.json` 的 include 只有 `src` 与 `shared/reading` —— `apps/blog` 整个不在里面，
//   而 `astro build` 又只能在装了 Windows 原生二进制的机器上跑（沙箱里跑不了）。
// 这个门禁是纯 JS，任何平台、不装依赖也能跑，正好补上这个空档。
//
// 用法：node scripts/blog/check-imports.mjs
// ⚠️ 要在 `npm run generate:lab-content` **之后**跑：`src/blog-adapter.ts` 依赖
//    `.generated/lab-content.json`，那份文件是生成物、不进 git。

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));

/** 检查范围：`src/` 是三维应用，`apps/blog/src` 是 Astro 子应用（后者不在根 tsconfig 里）。 */
const SCAN_DIRS = ["src", "apps/blog/src"];
const SOURCE_RE = /\.(astro|ts|tsx|js|mjs|cjs)$/;

/** 相对 specifier 可能的落点：直接补扩展名，或补成目录下的 index。 */
const CANDIDATES = [
  "",
  ".astro",
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".css",
  ".svg",
  ".md",
  "/index.astro",
  "/index.ts",
  "/index.js",
];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (SOURCE_RE.test(entry.name)) out.push(path);
  }
  return out;
}

const isFile = (path) => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

const resolves = (base) => CANDIDATES.some((suffix) => isFile(base + suffix));

const errors = [];
let checked = 0;

for (const dir of SCAN_DIRS) {
  for (const file of walk(resolve(root, dir))) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/(?:import|export)[^'"]*?from\s+["']([^"']+)["']/g)) {
      const specifier = match[1];
      // 只查相对路径：包名与别名（`@reading/prose.css` 之类）交给各自的构建器解析。
      if (!specifier.startsWith(".")) continue;
      checked += 1;
      if (resolves(resolve(dirname(file), specifier))) continue;
      const hint = specifier.includes(".generated")
        ? "（要先跑 npm run generate:lab-content）"
        : "";
      errors.push(`${file.replace(root, ".").replace(/\\/g, "/")} → ${specifier}${hint}`);
    }
  }
}

if (errors.length) {
  console.error(`相对导入检查失败 ${errors.length} 项：\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log(`相对导入检查通过：${SCAN_DIRS.join(" + ")} 共 ${checked} 条，全部能解析到真实文件。`);
