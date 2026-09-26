import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const now = process.env.BUILD_NOW ?? new Date().toISOString();
const env = { ...process.env, BUILD_NOW: now };

// ★Windows 上不能直接 spawn "npm.cmd"★
// Node 修 CVE-2024-27980 之后（20.12 / 21.7 / 22 起），不带 `shell: true` 去 spawn 一个
// .bat / .cmd 会直接抛 EINVAL。症状极具迷惑性：**第一步就"失败"，但子进程根本没起来** ——
// 连 check:content 自己的输出都没有，看起来像检查没通过。
// 所以 Windows 交给 shell 跑整条命令（实测 cmd.exe 里的 npm 本身是好的）；其余平台保持
// 直接 spawn，不经 shell。（同类问题本仓库在 scripts/reading/fixtures/build-fixture-site.mjs
// 里也绕过一次，那里的做法是干脆不碰 npm 包装器。）
const isWindows = process.platform === "win32";

const steps = [
  // 相对导入最先查：路径错在建构建器里只会给一句 UNRESOLVED_IMPORT，
  // 而且要在 Windows 上跑到那一步才看得见（调度器见下）。
  "check:imports",
  "check:content",
  "check:features",
  "build:blog",
  "build:lab",
  // 重定向表放在两个构建目标之后：它要读 dist 判断"旧地址是否撞上本站现有页面"，
  // 并写入 dist/_redirects（CF Pages 认这个路径）。
  "build:redirects",
  "search:index",
  "check:site",
];

console.log(`统一构建开始，BUILD_NOW=${now}`);
for (const step of steps) {
  console.log(`\n=== npm run ${step} ===`);
  const result = isWindows
    ? spawnSync(`npm run ${step}`, { cwd: root, env, stdio: "inherit", shell: true })
    : spawnSync("npm", ["run", step], { cwd: root, env, stdio: "inherit" });
  if (result.error) {
    // "起不来"（spawn 本身失败）与"跑起来但退出码非零"是两类问题，日志里必须分得开。
    console.error(`无法启动 ${step}：${result.error.message}`);
  }
  if (result.status !== 0) {
    console.error(`构建在 ${step} 失败（exit ${result.status ?? "null"}）。`);
    process.exit(result.status ?? 1);
  }
}
console.log("\n统一构建完成：dist/ 包含博客、lab、搜索索引。");
