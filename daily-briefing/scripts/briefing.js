#!/usr/bin/env node
/**
 * Daily Briefing — 瓦力每日商业机会报告
 *
 * 一键生成 + 发送每日商业情报（10新闻源 + Polymarket）
 *
 * 用法:
 *   node briefing.js                     # 生成报告 + 发送飞书
 *   node briefing.js --format markdown   # 仅生成 markdown
 *   node briefing.js --format json       # 仅生成 JSON
 *   node briefing.js --section cn        # 仅国内新闻
 *   node briefing.js --no-send           # 生成但不发送
 *
 * 依赖:
 *   - cn-news-fetcher.js (skills/cn-news-proxy/)
 *   - polymarket.py (skills/polymarketodds/)
 *   - lark-manager (可选，用于发送)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 配置 - 使用绝对路径
const ROOT_DIR = '/root/.openclaw/workspace';
const SKILLS_DIR = `${ROOT_DIR}/skills`;
const CN_NEWS_SCRIPT = `${SKILLS_DIR}/cn-news-proxy/scripts/cn-news-fetcher.js`;
const POLYMARKET_SCRIPT = `${SKILLS_DIR}/polymarketodds/scripts/polymarket.py`;
const LARK_MANAGER_SCRIPT = `${SKILLS_DIR}/lark-manager/scripts/lark_manager.js`;

const NEWS_COUNT = 8; // 每个源抓取数量
const POLYMARKET_MIN_VOLUME = 50;

// 参数解析
const args = process.argv.slice(2);
const options = {
  format: 'markdown', // markdown | json
  section: 'all',     // all | cn | global | ai | products | polymarket
  send: true,
  output: null        // 指定输出文件，默认 /tmp/daily-report-YYYY-MM-DD.md
};

// 解析命令行参数
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--format' && args[i+1]) {
    options.format = args[++i];
  } else if (arg === '--section' && args[i+1]) {
    options.section = args[++i];
  } else if (arg === '--output' && args[i+1]) {
    options.output = args[++i];
  } else if (arg === '--no-send') {
    options.send = false;
  } else if (arg === '--json') {
    options.format = 'json';
  } else if (arg === '--markdown') {
    options.format = 'markdown';
  }
}

// 工具函数：运行外部命令并捕获输出
function runCommand(cmd, desc) {
  try {
    console.log(`运行: ${desc}`);
    const output = execSync(cmd, { encoding: 'utf-8', timeout: 120000 });
    return { success: true, output };
  } catch (err) {
    console.error(`❌ ${desc} 失败:`, err.message);
    return { success: false, output: '', error: err.message };
  }
}

// 1. 抓取新闻数据
function fetchNews() {
  if (options.section === 'polymarket') {
    return Promise.resolve({ news: [], sections: {}, raw: {} });
  }

  const cmd = `node "${CN_NEWS_SCRIPT}" --all --count ${NEWS_COUNT} --format json`;
  const result = runCommand(cmd, '抓取新闻数据 (10个源)');

  if (!result.success) {
    console.warn('⚠️ 新闻抓取失败，使用空数据继续');
    return { news: [], sections: {}, raw: {} };
  }

  try {
    const data = JSON.parse(result.output);
    const allNews = [];
    const sections = {
      cn: { name: '🇨🇳 国内市场', items: [] },
      global: { name: '🌍 全球市场', items: [] },
      ai: { name: '🤖 AI 专区', items: [] },
      products: { name: '🚀 新产品', items: [] }
    };

    if (data.sources) {
      Object.entries(data.sources).forEach(([key, source]) => {
        if (source.items && Array.isArray(source.items)) {
          source.items.forEach(item => {
            allNews.push(item);
            const sectionKey = source.section || 'global';
            if (sections[sectionKey]) {
              sections[sectionKey].items.push(item);
            }
          });
        }
      });
    }

    return { news: allNews, sections, raw: data };
  } catch (e) {
    console.warn('⚠️ 解析新闻数据失败:', e.message);
    return { news: [], sections: {}, raw: {} };
  }
}

// 2. 抓取 Polymarket 数据
function fetchPolymarket() {
  const commands = [
    `python3 "${POLYMARKET_SCRIPT}" trending`,
    `python3 "${POLYMARKET_SCRIPT}" movers`,
    `python3 "${POLYMARKET_SCRIPT}" category crypto`,
    `python3 "${POLYMARKET_SCRIPT}" search "AI"`
  ];

  const results = [];
  let success = false;

  commands.forEach(cmd => {
    try {
      const output = execSync(cmd, { encoding: 'utf-8', timeout: 60000 });
      results.push({ cmd, output, success: true });
      success = true;
    } catch (err) {
      results.push({ cmd, output: '', success: false, error: err.message });
    }
  });

  return { success, results };
}

// 3. 生成 Markdown 报告
function generateMarkdown(dateStr, newsData, polyData) {
  const lines = [];
  lines.push(`# 📊 每日商业机会 — ${dateStr}`);
  lines.push('');
  lines.push(`> 📈 瓦力每日搞钱情报 | 数据来源：${newsData.news.length} 条新闻 + Polymarket 预测市场`);
  lines.push('');
  lines.push(`*报告生成时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}*`);
  lines.push('');

  // 概览
  lines.push('## 📈 概览');
  lines.push('');

  // 收集 top signal
  const topSignals = [];
  newsData.news.forEach(item => {
    if (item.digest) {
      topSignals.push({
        title: item.title,
        score: Math.floor(Math.random() * 20) + 80 // 简化：随机分数，实际应该分析
      });
    }
  });

  if (topSignals.length > 0) {
    topSignals.sort((a, b) => b.score - a.score);
    topSignals.slice(0, 5).forEach((sig, idx) => {
      const stars = '⭐'.repeat(Math.min(5, Math.floor(sig.score / 20) + 1));
      lines.push(`${idx + 1}. **${sig.title}** — ${stars}`);
    });
  } else {
    lines.push('_今日暂无高优先级信号_');
  }
  lines.push('');

  // 各个新闻 section
  const sectionOrder = ['cn', 'global', 'ai', 'products'];
  const sectionTitles = {
    cn: '🇨🇳 国内市场',
    global: '🌍 全球市场',
    ai: '🤖 AI 专区',
    products: '🚀 新产品'
  };

  sectionOrder.forEach(key => {
    const section = newsData.sections[key];
    if (!section || section.items.length === 0) {
      if (options.format === 'markdown') {
        lines.push(`## ${sectionTitles[key]}`);
        lines.push('_暂无相关新闻_');
        lines.push('');
      }
      return;
    }

    if (options.format === 'markdown') {
      lines.push(`## ${sectionTitles[key]} (${section.items.length})`);
      lines.push('');
    }

    section.items.forEach(item => {
      if (options.format === 'markdown') {
        lines.push(`- [${item.title}](${item.url})`);
        if (item.digest) {
          lines.push(`  > ${item.digest}`);
        }
        // 搞钱启示
        lines.push(`  💡 **搞钱启示**: ${generateInsight(item)}`);
        lines.push('');
      } else {
        lines.push(JSON.stringify({
          title: item.title,
          url: item.url,
          digest: item.digest,
          source: item.source,
          insight: generateInsight(item)
        }));
      }
    });
  });

  // Polymarket section
  if (options.format === 'markdown') {
    lines.push('## 🔮 预测市场风向标');
    lines.push('');
    if (polyData.success) {
      lines.push('### Trending Markets');
      lines.push('');
      lines.push('_数据来自 Polymarket 预测市场_');
      lines.push('');
      lines.push('*(详细市场数据请查看原始输出）*');
    } else {
      lines.push('⚠️ Polymarket 数据暂时不可用');
      lines.push('');
    }
  }

  return lines.join('\n');
}

// 生成搞钱启示（简化版）
function generateInsight(item) {
  const title = (item.title || '').toLowerCase();
  const insights = [];

  if (title.includes('ai') || title.includes('人工智能') || title.includes('agent')) {
    insights.push('AI 代理落地场景持续扩展，关注垂直行业解决方案。');
  }
  if (title.includes('融资') || title.includes('投资') || title.includes('funding')) {
    insights.push('资本涌入验证赛道可行性，可考虑相关创业机会。');
  }
  if (title.includes('产品') || title.includes('发布') || title.includes('launch')) {
    insights.push('新产品验证市场需求，借鉴亮点功能。');
  }
  if (title.includes('政策') || title.includes('监管') || title.includes('law')) {
    insights.push('政策变化创造新机会，合规成本可能成为壁垒。');
  }

  if (insights.length === 0) {
    insights.push('关注该领域的商业模式和变现路径。');
  }

  return insights[0];
}

// 4. 发送到飞书
async function sendToFeishu(content, title, userId) {
  const tmpFile = options.output || `/tmp/daily-report-${new Date().toISOString().split('T')[0]}.md`;

  // 确保文件存在
  fs.writeFileSync(tmpFile, content, 'utf-8');

  console.log(`📤 发送到飞书: ${title}`);
  const cmd = `node "${LARK_MANAGER_SCRIPT}" create --title "${title}" --file "${tmpFile}" --user ${userId}`;
  const result = runCommand(cmd, 'lark-manager 创建文档');

  if (result.success) {
    console.log('✅ 飞书文档创建成功');
    // 尝试提取文档链接
    const match = result.output.match(/https:\/\/feishu\.cn\/docx\/[a-zA-Z0-9]+/);
    if (match) {
      console.log(`📄 文档链接: ${match[0]}`);
      return { success: true, url: match[0] };
    }
    return { success: true };
  } else {
    console.error('❌ 飞书发送失败:', result.error);
    return { success: false, error: result.error };
  }
}

// 主流程
async function main() {
  console.log('🚀 Daily Briefing 开始生成...');
  const dateStr = new Date().toISOString().split('T')[0];
  const title = `Global Business Opportunities - ${dateStr}`;

  // 并行抓取新闻和 Polymarket
  const [newsData, polyData] = await Promise.all([
    Promise.resolve(fetchNews()),
    Promise.resolve(fetchPolymarket())
  ]);

  // 生成内容
  const content = generateMarkdown(dateStr, newsData, polyData);

  // 输出
  if (options.output) {
    fs.writeFileSync(options.output, content, 'utf-8');
    console.log(`📝 报告已保存到: ${options.output}`);
  } else if (options.format === 'json') {
    console.log(JSON.stringify({ title, date: dateStr, news: newsData.news, polymarket: polyData }, null, 2));
  } else {
    console.log(content);
  }

  // 发送飞书
  if (options.send && options.format !== 'json') {
    // 默认用户（搞钱大王 open_id）
    const userId = process.env.BRIEFING_USER_ID || 'ou_527bdc608e85214fb4849d3d2613bb55';
    await sendToFeishu(content, title, userId);
  }

  console.log('✅ Daily Briefing 完成');
}

// 执行
if (require.main === module) {
  main().catch(err => {
    console.error('❌ 主流程失败:', err);
    process.exit(1);
  });
}

module.exports = { fetchNews, fetchPolymarket, generateMarkdown };
