import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import remarkCjkFriendly from "remark-cjk-friendly";

// ★默认值必须与线上主机名一致★：`cloudwing.top` 的 apex 已被另一个站占用，本站挂子域
// `blog.cloudwing.top`。这里写错（或线上不设 BLOG_SITE_ORIGIN）会让每篇文章的 canonical /
// og:url / sitemap 都指向另一个站，搜索引擎会按重复内容把本站文章丢掉。
const site = process.env.BLOG_SITE_ORIGIN || "https://blog.cloudwing.top";
// IR5 fixture builds run the same configuration against synthetic content and
// write somewhere outside `dist/`; both variables are unset for a normal build.
const outDir = process.env.BLOG_OUT_DIR || "../../dist";

export default defineConfig({
  site,
  outDir,
  publicDir: "./public",
  markdown: {
    // CommonMark 默认不把中文标点当作 punctuation，导致 `**…：**后接文字`
    // 这类强调不渲染。该插件让中文标点参与 flanking 判定。
    remarkPlugins: [remarkCjkFriendly],
  },
  build: {
    format: "directory",
    inlineStylesheets: "auto",
  },
  trailingSlash: "ignore",
  integrations: [
    sitemap({
      filter: (page) => !page.includes("/lab/") && !page.includes("/search/"),
    }),
  ],
  devToolbar: { enabled: false },
});
