---
name: cn-news-proxy
description: 通过 Spaceship 海外代理抓取中国财经/科技新闻源。支持新浪财经、东方财富、虎嗅、36氪。用于每日商业报告的国内数据源。
---

# CN News Proxy v2 — 全球搞钱情报源

## 何时使用
- 生成每日商业报告时，需要国内+海外多源新闻
- 搞钱大王要求了解国内市场、AI 动态、新产品趋势

## 依赖
- SSH 到 Spaceship（`ssh spaceship`），已在 TOOLS.md 配置
- 本地可直接访问 HN Algolia API

## 脚本路径
```
SKILL_DIR/scripts/cn-news-fetcher.js
```

## 快速用法

### 抓取所有源（10 个）
```bash
node SKILL_DIR/scripts/cn-news-fetcher.js --all --format markdown
```

### 按板块抓取
```bash
node SKILL_DIR/scripts/cn-news-fetcher.js --section cn        # 🇨🇳 国内: 新浪财经+东方财富+虎嗅+36氪
node SKILL_DIR/scripts/cn-news-fetcher.js --section global     # 🌍 海外: HN+Ars Technica
node SKILL_DIR/scripts/cn-news-fetcher.js --section ai         # 🤖 AI: 量子位+AI News+HuggingFace Blog
node SKILL_DIR/scripts/cn-news-fetcher.js --section products   # 🚀 新产品: Product Hunt
```

### 单源 / 自定义数量
```bash
node SKILL_DIR/scripts/cn-news-fetcher.js --source sina --count 20
```

## 数据源（10 个）

### 🇨🇳 国内市场
| 源 | API 类型 | 内容 |
|----|---------|------|
| 新浪财经 | REST API | 实时滚动财经：A股/基金/宏观 |
| 东方财富 | JSONP API | 实时快讯：A股/港股/全球市场 |
| 虎嗅 | POST API | 深度商业/科技文章 |
| 36氪 | RSS | 创投融资/科技快讯 |

### 🤖 AI 专区
| 源 | API 类型 | 内容 |
|----|---------|------|
| 量子位 | WordPress REST | 国内 AI 新闻（融资/模型/应用）|
| AI News | RSS | 海外 AI 行业新闻 |
| HuggingFace Blog | RSS | 开源模型/工具动态 |

### 🌍 全球市场
| 源 | API 类型 | 内容 |
|----|---------|------|
| Hacker News | Algolia API (本地) | 技术社区热点 |
| Ars Technica | RSS | 深度科技/政策 |

### 🚀 新产品
| 源 | API 类型 | 内容 |
|----|---------|------|
| Product Hunt | Atom Feed | 每日新产品 |

## 架构
- 所有远程源通过**一次 SSH 连接**批量执行（batch heredoc），约 30-60 秒
- HN 是本地直连，不走 SSH
- 输出格式支持 JSON 和 Markdown，按板块分组

## 注意事项
- 机器之心(jiqizhixin)不可用：纯 SPA + 防爬
- 界面新闻不可用：纯 SPA
- 36氪 API gateway 已下线，改用 RSS
- 量子位用 WordPress REST API（`/wp-json/wp/v2/posts`）
