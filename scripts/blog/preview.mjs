import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const dist = resolve(root, "dist");
// 参数：一个可选的纯数字端口，可选的 --open（监听后自动打开浏览器）。
// 旧写法把 argv[2] 直接当端口，于是 `--open` 会被解析成 NaN 端口，
// 所以这里先按标志分流，端口只认纯数字的那个参数。
const cliArgs = process.argv.slice(2);
const openBrowser = cliArgs.includes("--open");
const portArg = cliArgs.find((arg) => /^\d+$/.test(arg));
const port = Number(process.env.PORT ?? portArg ?? 4173);

function openInBrowser(url) {
  const [command, args] =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  try {
    const child = spawn(command, args, { stdio: "ignore", detached: true });
    // spawn 的失败是异步 'error' 事件，try/catch 接不住；不监听会变成未处理异常。
    child.on("error", (error) => {
      console.warn(`无法自动打开浏览器（${error.message}），请手动访问 ${url}`);
    });
    child.unref();
  } catch (error) {
    console.warn(`无法自动打开浏览器（${error.message}），请手动访问 ${url}`);
  }
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".glb": "model/gltf-binary",
  ".ogg": "audio/ogg",
  ".mp3": "audio/mpeg",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

async function findFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const safe = normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  let file = join(dist, safe);
  if (!file.startsWith(dist + sep) && file !== dist) return null;
  try {
    const info = await stat(file);
    if (info.isDirectory()) file = join(file, "index.html");
    const fileInfo = await stat(file);
    return fileInfo.isFile() ? file : null;
  } catch {
    return null;
  }
}

/**
 * 读产物里的 `_redirects`（由 `scripts/blog/build-redirects.mjs` 生成）。
 *
 * ★为什么必须读它★：本预览服务的就是 `dist/`，而**站点开屏**（根 `/` 用 200 rewrite
 * 直接给三维终端）完全依赖这条规则 —— 预览不认它，本地访问 `/` 就是 404，
 * 它自称的"与线上一致"也就不成立了。
 *
 * 只实现本项目用到的语义：精确路径 + 结尾 `*` 的前缀匹配，按文件顺序取第一条命中的。
 * （CF Pages 还支持 `:placeholder` 等写法，本项目没有用到，不实现。）
 */
async function loadRedirects() {
  let text = "";
  try {
    text = await readFile(join(dist, "_redirects"), "utf8");
  } catch {
    return [];
  }
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const [from, to, status] = line.split(/\s+/);
      return { from, to, status: Number(status) || 301 };
    })
    .filter((rule) => rule.from && rule.to);
}

const redirects = await loadRedirects();

function matchingRule(urlPath) {
  return redirects.find((rule) =>
    rule.from.endsWith("*") ? urlPath.startsWith(rule.from.slice(0, -1)) : urlPath === rule.from,
  );
}

function createPreviewServer() {
  return createServer(async (request, response) => {
    const urlPath = (request.url ?? "/").split("?")[0];

    // 301 / 302 优先于静态文件（CF Pages 的语义：命中规则就把请求转走）。
    const rule = matchingRule(urlPath);
    if (rule && rule.status !== 200) {
      response.writeHead(rule.status, { Location: rule.to });
      response.end();
      return;
    }

    let file = await findFile(request.url ?? "/");
    // 200 是 rewrite：**静态文件优先**，只有文件不存在时才用目标内容作答（地址栏不变）。
    // 这与 CF Pages 一致，也正是构建期要拦"根路径上还留着 index.html"的原因。
    if (!file && rule && rule.status === 200) file = await findFile(rule.to);

    if (!file) {
      const notFound = join(dist, "404.html");
      try {
        await stat(notFound);
        response.writeHead(404, { "Content-Type": MIME[".html"] });
        createReadStream(notFound).pipe(response);
      } catch {
        response.writeHead(404, { "Content-Type": MIME[".txt"] });
        response.end("404 Not Found\n");
      }
      return;
    }
    response.writeHead(200, {
      "Content-Type": MIME[extname(file)] ?? "application/octet-stream",
    });
    createReadStream(file).pipe(response);
  });
}

/**
 * 启动预览。
 *
 * ★端口被占用时自动顺延★：`打开预览.cmd` 是双击入口，上一次的预览还开着时端口就占着，
 * 旧写法会直接抛 EADDRINUSE 的栈（对站长毫无意义）。这里顺延到下一个端口，
 * 并说明换端口的原因；真的连试十个都占用才报错退出。
 */
function listen(port, attemptsLeft = 10) {
  const server = createPreviewServer();
  server.once("error", (error) => {
    if (error.code === "EADDRINUSE" && attemptsLeft > 0) {
      if (attemptsLeft === 10) {
        console.log(`端口 ${port} 已被占用（多半是上一次的预览还开着）——换一个端口。`);
      }
      listen(port + 1, attemptsLeft - 1);
      return;
    }
    console.error(`无法启动预览：${error.message}`);
    process.exit(1);
  });
  server.listen(port, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${port}/`;
    console.log(`预览 ${url} （静态 dist/，未知路径返回真实 404）`);
    console.log(
      redirects.length
        ? `已载入 dist/_redirects：${redirects.length} 条规则（根路径是 200 rewrite，开屏即三维终端）。`
        : "未找到 dist/_redirects —— 先跑一次构建，根路径才会进三维终端。",
    );
    if (openBrowser) openInBrowser(url);
  });
}

listen(port);
