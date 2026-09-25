---
id: post-4ba7abb72f79
title: "分类筛选上线，图片瘦身到 3MB"
description: "作品库的分类筛选做好了；180MB 的 PNG 全部转成 webp，整站图片压到 3MB 出头。"
path: /2026/09/07/log/
publishedAt: "2026-09-07T00:00:00+08:00"
draft: false
categories: ["站点日志"]
tags: ["站点日志"]
author: CloudWing_X
legacyUrls: ["/posts/2026-09-07-log/"]
---

作品库的分类筛选今天上线。做成了单条磨砂玻璃的分段控件，事件挂在 document 上，软导航之后照样能用。

图片是这次的大头：180MB 的 PNG 全部转成 webp，整站压到 3MB 出头，加载立刻正常了。顺手把图床从 jsDelivr 换回本地相对路径——国内访问 jsDelivr 实在不稳，加载老是卡在图片上。

另外修了个藏了几天的 bug：汉堡菜单在软导航之后会失效，原因是监听器没跟着 DOM 重建，改成 document 级事件委托就好了。作品库也补了一篇《本站搭建与部署记录》。
