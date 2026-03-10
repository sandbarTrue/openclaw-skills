---
name: daily-briefing
description: 每日商业机会情报自动生成与推送。整合10个新闻源（国内外+AI专区）和Polymarket预测市场数据，生成搞钱日报并发布到飞书。每天8:00自动运行。
homepage: https://github.com/sandbarTrue/openclaw-skills/tree/main/skills/daily-briefing
user-invocable: true
disable-model-invocation: false
metadata:
  openclaw:
    emoji: "📊"
    requires:
      bins: [node, python3, jq, curl]
      scripts: [cn-news-fetcher.js, polymarket.py]
---

# 📊 Daily Briefing — 瓦力每日搞钱情报

## 简介
自动抓取 10 个新闻源 + Polymarket 预测市场数据，生成结构化商业机会报告，每日 8:00 推送到飞书。

## 数据源（10个）

### 🇨🇳 国内市场
| 源 | 内容 |
|----|------|
| 新浪财经 | A股/基金/宏观实时快讯 |
| 东方财富 | A股/港股/全球市场 |
| 虎嗅 | 深度商业/科技文章 |
| 36氪 | 创投融资/科技快讯 |

### 🤖 AI 专区
| 源 | 内容 |
|----|------|
| 量子位 | 国内 AI 新闻 |
| AI News | 海外 AI 行业 |
| HuggingFace Blog | 开源模型/工具 |

### 🌍 全球市场
| 源 | 内容 |
|----|------|
| Hacker News | 技术社区热点 |
| Ars Technica | 深度科技/政策 |

### 🚀 新产品
| 源 | 内容 |
|----|------|
| Product Hunt | 每日新产品 |

### 🔮 预测市场
| 源 | 内容 |
|----|------|
| Polymarket | 政治/加密/体育等预测市场 |

## 快速使用

### 手动运行（调试）
```bash
node skills/daily-briefing/scripts/briefing.js --format markdown --output /tmp/test-report.md
```

### 生成 JSON（供其他工具处理）
```bash
node skills/daily-briefing/scripts/briefing.js --format json
```

### 只抓国内/海外/AI/预测
```bash
node skills/daily-briefing/scripts/briefing.js --section cn
node skills/daily-briefing/scripts/briefing.js --section global
node skills/daily-briefing/scripts/briefing.js --section ai
node skills/daily-briefing/scripts/briefing.js --section polymarket
```

## 输出结构

报告包含 6 个 section，每个 item 附带"搞钱启示"：

```
# 📊 每日商业机会 — 2026-03-10

## 📈 概览
- Top 5 搞钱信号（评级：⭐⭐⭐⭐⭐）

## 🇨🇳 国内市场
- [标题](url) - 摘要 + 搞钱启示

## 🌍 全球市场
...

## 🤖 AI 专区
...

## 🚀 新产品
...

## 🔮 预测市场风向标
...
```

## 自动发送到飞书

配置 cron（每日 08:00）：
```bash
0 8 * * * node /root/.openclaw/workspace/skills/daily-briefing/scripts/briefing.js --send-feishu --user ou_527bdc608e85214fb4849d3d2613bb55
```

或者使用 OpenClaw cron（推荐）：
```json
{
  "name": "daily-business-briefing",
  "schedule": { "kind": "cron", "expr": "0 8 * * *" },
  "payload": { "kind": "agentTurn", "message": "运行每日商业报告：node skills/daily-briefing/scripts/briefing.js --send-feishu" }
}
```

## 安装与依赖

### 系统依赖
```bash
# Ubuntu/Debian
apt-get install -y nodejs python3 jq curl

# Node
npm install axios xml2js
```

### 安装脚本
```bash
cd skills/daily-briefing/scripts
npm install
```

## 故障排查

### 新闻源不可达
- cn-news-proxy 依赖 SSH 到 Spaceship（`ssh spaceship`）。检查 `~/.ssh/config`。
- 如果 Spaceship 宕机，Skill 会跳过该源继续运行。

### Polymarket API 限流
- 使用 `--min-volume 50` 过滤低流动性市场。
- 如果 API 失败，report 中会标记 `⚠️ Polymarket 数据暂时不可用`。

### 飞书发送失败
- 确保 `lark-manager` skill 已安装并可访问。
- 检查 Feishu App ID/Secret 环境变量或配置文件。

## 设计原则

- **时效性**：只抓取过去 24h 内容（部分源为最近几天）。
- **可解释性**：每条新闻附带"搞钱启示"，直接链接到瓦力的核心目标。
- **容错性**：任一数据源失败不影响整体报告生成。
- **自动化**：一期配置好后无需人工干预。

## 自定义

修改 `scripts/briefing.js`：
- `NEWS_COUNT`：每个源抓取数量（默认 8）
- `POLYMARKET_MIN_VOLUME`：预测市场最低交易量（默认 50）
- `OUTPUT_FORMAT`：markdown 或 json

---

*本 skill 基于现有成熟模块（cn-news-proxy, polymarketodds, lark-manager）封装，确保稳定性。*
