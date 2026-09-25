---
id: post-bf0d391b87d1
title: "2026-09-11 更新记录"
description: "当天共 5 项改动，涵盖 优化、上线、修复。"
path: /log/2026-09-11/
publishedAt: "2026-09-11T00:00:00+08:00"
draft: false
categories: ["站点日志"]
tags: ["changelog"]
author: CloudWing_X
legacyUrls: []
---

本日共 5 项改动。

- **【优化】**移除失效的 MiSans 字体外链：上游仓库已 404，字体从未生效，却是一个阻塞渲染的跨域请求
- **【上线】**正文拉丁词邻近可变字重：关于页正文里的英文/数字随光标变重，中文排版完全不动
- **【上线】**标题接入 React Bits VariableProximity：与正文效果同一套参数（wght 400 → 900）
- **【优化】**互动页背景与全站统一：改用全站粒子层，去掉单独的 GridScan 深色背景
- **【修复】**互动页背景高度不足：GridScan 只铺 670px，补了 resize 重测与 ResizeObserver
