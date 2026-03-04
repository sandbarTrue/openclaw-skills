---
name: hd-screenshot
description: 通过 CDP 协议截取高清（4K）网页截图。支持分段截图、自定义视口、devicePixelRatio 放大。用于验收报告、文档截图等需要高清晰度的场景。
---

# HD Screenshot — 4K 网页高清截图

## 何时使用
- 需要高清截图嵌入飞书文档/验收报告
- browser tool 默认截图太模糊（被压缩到 ~600px 宽）
- 长页面需要分段截图

## 原理
browser tool 截图会被压缩。本 skill 直接通过 CDP WebSocket 调用 `Page.captureScreenshot`，配合 `Emulation.setDeviceMetricsOverride` 设置 2x deviceScaleFactor，获得 3840x2160 的 4K PNG 截图。

## 前置条件
- OpenClaw 浏览器已启动（`browser action=start profile=openclaw`）
- 已打开目标页面（`browser action=open`）
- Node.js + ws 包（`npm install -g ws`）

## 用法

### 基本用法
```bash
# 1. 先用 browser tool 打开页面，记下 wsUrl
# 2. 调用截图脚本
node SKILL_DIR/scripts/cdp-screenshot.js <wsUrl> <outputDir> [segments] [viewportWidth] [viewportHeight]
```

### 参数
- `wsUrl`: CDP WebSocket URL（从 browser open 返回的 wsUrl）
- `outputDir`: 截图输出目录
- `segments`: 分段数（默认 2，会滚动截取多段）
- `viewportWidth`: 视口宽度（默认 1920）
- `viewportHeight`: 视口高度（默认 1080）

### 示例
```bash
# 截取 2 段 4K 截图
node SKILL_DIR/scripts/cdp-screenshot.js \
  "ws://127.0.0.1:18800/devtools/page/XXXXX" \
  /path/to/output \
  2

# 输出: /path/to/output/screenshot-1.png (3840x2160)
#       /path/to/output/screenshot-2.png (3840x2160)
```

### 配合飞书文档使用
```bash
# 1. 截图
node SKILL_DIR/scripts/cdp-screenshot.js "$WS_URL" /tmp/screenshots 3

# 2. 在 markdown 中引用
echo "![截图1](/tmp/screenshots/screenshot-1.png)" >> report.md

# 3. 用 lark_manager 创建带图片的飞书文档
node skills/lark-manager/scripts/lark_manager.js create --title "报告" --file report.md
```

## 输出
- 格式: PNG（无损）
- 分辨率: 3840x2160（2x DPR，实际渲染 1920x1080）
- 文件大小: 通常 300-500KB/张
