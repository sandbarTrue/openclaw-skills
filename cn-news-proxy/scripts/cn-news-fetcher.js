#!/usr/bin/env node
/**
 * CN News Proxy Fetcher v2
 * 通过 Spaceship SSH 代理抓取国内外财经/科技/AI 新闻源
 * 
 * 数据源:
 *   国内: 新浪财经、东方财富、虎嗅、36氪、量子位(AI)
 *   海外: AI News、HuggingFace Blog、Product Hunt、Ars Technica、HN
 * 
 * Usage:
 *   node cn-news-fetcher.js --all                    # 所有源
 *   node cn-news-fetcher.js --section cn              # 国内源
 *   node cn-news-fetcher.js --section global          # 海外源
 *   node cn-news-fetcher.js --section ai              # AI 专区
 *   node cn-news-fetcher.js --section products        # 新产品
 *   node cn-news-fetcher.js --source sina             # 单源
 *   node cn-news-fetcher.js --all --format markdown   # Markdown输出
 *   node cn-news-fetcher.js --all --count 10          # 每源10条
 */

const { execSync } = require('child_process');

const SSH_HOST = 'spaceship';
const SSH_TIMEOUT = 30;
const DEFAULT_COUNT = 10;

// ─── Source Definitions ───
const SOURCES = {
  // ── 国内财经 ──
  sina: {
    name: '新浪财经',
    section: 'cn',
    icon: '🔴',
    buildCmd: (count) =>
      `curl -sL --max-time 15 'https://feed.mix.sina.com.cn/api/roll/get?pageid=153&lid=2509&k=&num=${count}&page=1&r=0.${Date.now() % 1000}'`,
    parse: (raw) => {
      const d = JSON.parse(raw);
      return (d.result?.data || []).map(item => ({
        title: item.title || '',
        url: item.url || '',
        time: item.ctime || item.createtime || '',
        digest: (item.summary || item.title || '').slice(0, 200),
        source: '新浪财经'
      }));
    }
  },

  eastmoney: {
    name: '东方财富',
    section: 'cn',
    icon: '🟠',
    buildCmd: (count) =>
      `curl -sL --max-time 15 'https://newsapi.eastmoney.com/kuaixun/v1/getlist_102_ajaxResult_${count}_1_.html' -H 'User-Agent: Mozilla/5.0'`,
    parse: (raw) => {
      const jsonStr = raw.replace(/^var\s+ajaxResult\s*=\s*/, '').replace(/;\s*$/, '');
      const d = JSON.parse(jsonStr);
      return (d.LivesList || []).map(item => ({
        title: item.title || item.simtitle || '',
        url: item.url_w || item.url_m || '',
        time: item.showtime || '',
        digest: (item.digest || item.simdigest || '').replace(/【[^】]*】/, '').slice(0, 200),
        source: '东方财富'
      }));
    }
  },

  huxiu: {
    name: '虎嗅',
    section: 'cn',
    icon: '🔵',
    buildCmd: (count) =>
      `curl -sL --max-time 15 'https://api-article.huxiu.com/web/article/articleList' -X POST -H 'Content-Type: application/x-www-form-urlencoded' -H 'User-Agent: Mozilla/5.0' -d 'platform=www&page=1&pagesize=${count}'`,
    parse: (raw) => {
      const d = JSON.parse(raw);
      return (d.data?.dataList || []).map(item => ({
        title: item.title || '',
        url: item.share_url || `https://www.huxiu.com/article/${item.aid}.html`,
        time: item.formatDate || item.dateline || '',
        digest: (item.summary || '').slice(0, 200),
        source: '虎嗅'
      }));
    }
  },

  '36kr': {
    name: '36氪',
    section: 'cn',
    icon: '🟢',
    buildCmd: (count) =>
      `curl -sL --max-time 15 'https://36kr.com/feed' -H 'User-Agent: Mozilla/5.0'`,
    parse: (raw) => {
      const items = [];
      const itemBlocks = raw.split('<item>').slice(1);
      for (const block of itemBlocks) {
        if (items.length >= 15) break;
        const titleMatch = block.match(/<title>([^<]+)<\/title>/);
        const linkMatch = block.match(/<link><!\[CDATA\[([^\]]+)\]\]><\/link>/) || block.match(/<link>([^<]+)<\/link>/);
        const dateMatch = block.match(/<pubDate>([^<]+)<\/pubDate>/);
        const descMatch = block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/);
        let digest = '';
        if (descMatch) {
          digest = descMatch[1].replace(/<[^>]+>/g, '').trim().slice(0, 200);
        }
        items.push({
          title: titleMatch ? titleMatch[1].trim() : '',
          url: linkMatch ? linkMatch[1].trim() : 'https://36kr.com',
          time: dateMatch ? dateMatch[1].trim() : '',
          digest,
          source: '36氪'
        });
      }
      return items;
    }
  },

  // ── AI 专区 ──
  qbitai: {
    name: '量子位',
    section: 'ai',
    icon: '🧠',
    buildCmd: (count) =>
      `curl -sL --max-time 15 'https://www.qbitai.com/wp-json/wp/v2/posts?per_page=${count}' -H 'User-Agent: Mozilla/5.0'`,
    parse: (raw) => {
      const d = JSON.parse(raw);
      return d.map(item => ({
        title: (item.title?.rendered || '').replace(/&#[0-9]+;/g, '').replace(/<[^>]+>/g, ''),
        url: item.link || '',
        time: item.date || '',
        digest: (item.excerpt?.rendered || '').replace(/<[^>]+>/g, '').trim().slice(0, 200),
        source: '量子位'
      }));
    }
  },

  ainews: {
    name: 'AI News',
    section: 'ai',
    icon: '🤖',
    buildCmd: (count) =>
      `curl -sL --max-time 15 'https://www.artificialintelligence-news.com/feed/' -H 'User-Agent: Mozilla/5.0'`,
    parse: (raw) => {
      const items = [];
      const itemBlocks = raw.split('<item>').slice(1);
      for (const block of itemBlocks) {
        if (items.length >= 15) break;
        const titleMatch = block.match(/<title><!\[CDATA\[([^\]]+)\]\]><\/title>/) || block.match(/<title>([^<]+)<\/title>/);
        const linkMatch = block.match(/<link>([^<\s]+)/);
        const dateMatch = block.match(/<pubDate>([^<]+)<\/pubDate>/);
        const descMatch = block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/);
        let digest = '';
        if (descMatch) digest = descMatch[1].replace(/<[^>]+>/g, '').trim().slice(0, 200);
        if (titleMatch) {
          items.push({
            title: titleMatch[1].trim(),
            url: linkMatch ? linkMatch[1].trim() : '',
            time: dateMatch ? dateMatch[1].trim() : '',
            digest,
            source: 'AI News'
          });
        }
      }
      return items;
    }
  },

  hfblog: {
    name: 'HuggingFace Blog',
    section: 'ai',
    icon: '🤗',
    buildCmd: (count) =>
      `curl -sL --max-time 15 'https://huggingface.co/blog/feed.xml' -H 'User-Agent: Mozilla/5.0'`,
    parse: (raw) => {
      const items = [];
      // HF Blog uses RSS <item> format
      const itemBlocks = raw.split('<item>').slice(1);
      for (const block of itemBlocks) {
        if (items.length >= 15) break;
        const titleMatch = block.match(/<title[^>]*>([^<]+)<\/title>/);
        const linkMatch = block.match(/<link>([^<\s]+)/);
        const dateMatch = block.match(/<pubDate>([^<]+)<\/pubDate>/);
        if (titleMatch) {
          items.push({
            title: titleMatch[1].trim().replace(/&amp;/g, '&').replace(/&apos;/g, "'"),
            url: linkMatch ? linkMatch[1].trim() : '',
            time: dateMatch ? dateMatch[1].trim() : '',
            digest: '',
            source: 'HuggingFace'
          });
        }
      }
      return items;
    }
  },

  // ── 全球市场 ──
  ars: {
    name: 'Ars Technica',
    section: 'global',
    icon: '📡',
    buildCmd: (count) =>
      `curl -sL --max-time 15 'https://feeds.arstechnica.com/arstechnica/index' -H 'User-Agent: Mozilla/5.0'`,
    parse: (raw) => {
      const items = [];
      const itemBlocks = raw.split('<item>').slice(1);
      for (const block of itemBlocks) {
        if (items.length >= 15) break;
        const titleMatch = block.match(/<title><!\[CDATA\[([^\]]+)\]\]><\/title>/) || block.match(/<title>([^<]+)<\/title>/);
        const linkMatch = block.match(/<link>([^<\s]+)/);
        const dateMatch = block.match(/<pubDate>([^<]+)<\/pubDate>/);
        const descMatch = block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/);
        let digest = '';
        if (descMatch) digest = descMatch[1].replace(/<[^>]+>/g, '').trim().slice(0, 200);
        if (titleMatch) {
          items.push({
            title: titleMatch[1].trim(),
            url: linkMatch ? linkMatch[1].trim() : '',
            time: dateMatch ? dateMatch[1].trim() : '',
            digest,
            source: 'Ars Technica'
          });
        }
      }
      return items;
    }
  },

  // ── 新产品 ──
  producthunt: {
    name: 'Product Hunt',
    section: 'products',
    icon: '🚀',
    buildCmd: (count) =>
      `curl -sL --max-time 15 'https://www.producthunt.com/feed' -H 'User-Agent: Mozilla/5.0'`,
    parse: (raw) => {
      const items = [];
      // PH uses Atom <entry> format
      const entryBlocks = raw.split('<entry>').slice(1);
      for (const block of entryBlocks) {
        if (items.length >= 20) break;
        const titleMatch = block.match(/<title>([^<]+)<\/title>/);
        const linkMatch = block.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/);
        const dateMatch = block.match(/<published>([^<]+)<\/published>/);
        const contentMatch = block.match(/<content[^>]*>([\s\S]*?)<\/content>/);
        let digest = '';
        if (contentMatch) {
          digest = contentMatch[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/<[^>]+>/g, '').trim().slice(0, 200);
        }
        if (titleMatch) {
          items.push({
            title: titleMatch[1].trim(),
            url: linkMatch ? linkMatch[1].trim() : '',
            time: dateMatch ? dateMatch[1].trim() : '',
            digest,
            source: 'Product Hunt'
          });
        }
      }
      return items;
    }
  },

  // HN is local (no SSH needed)
  hn: {
    name: 'Hacker News',
    section: 'global',
    icon: '🟧',
    local: true, // 不需要SSH
    buildCmd: (count) =>
      `curl -sL --max-time 15 'https://hn.algolia.com/api/v1/search?query=&tags=front_page&hitsPerPage=${count}'`,
    parse: (raw) => {
      const d = JSON.parse(raw);
      return (d.hits || []).map(item => ({
        title: item.title || '',
        url: item.url || `https://news.ycombinator.com/item?id=${item.objectID}`,
        time: item.created_at || '',
        digest: `${item.points || 0} points, ${item.num_comments || 0} comments`,
        source: 'Hacker News'
      }));
    }
  }
};

// Section mapping
const SECTIONS = {
  cn: ['sina', 'eastmoney', 'huxiu', '36kr'],
  ai: ['qbitai', 'ainews', 'hfblog'],
  global: ['hn', 'ars'],
  products: ['producthunt']
};

// ─── Execute Command ───
function executeCmd(cmd, isLocal = false) {
  try {
    const fullCmd = isLocal ? cmd : `ssh ${SSH_HOST} ${JSON.stringify(cmd)}`;
    const result = execSync(fullCmd, {
      timeout: SSH_TIMEOUT * 1000,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return result.trim();
  } catch (err) {
    return null;
  }
}

// ─── Batch SSH via heredoc (one SSH connection, all remote commands) ───
function batchSSHFetch(sources, count) {
  const remoteSources = sources.filter(s => !SOURCES[s].local);
  const localSources = sources.filter(s => SOURCES[s].local);
  const results = {};

  // Build a bash script, write to tmp, pipe to ssh
  if (remoteSources.length > 0) {
    const fs = require('fs');
    let script = '#!/bin/bash\n';
    for (const src of remoteSources) {
      script += `echo "===SPLIT_${src}==="\n`;
      script += SOURCES[src].buildCmd(count) + '\n';
    }
    script += 'echo "===SPLIT_END==="\n';
    
    const tmpFile = `/tmp/cn-news-batch-${Date.now()}.sh`;
    fs.writeFileSync(tmpFile, script);
    
    try {
      const raw = execSync(`ssh ${SSH_HOST} bash < ${tmpFile}`, {
        timeout: 90 * 1000,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim();
      
      // Parse batch output
      for (let i = 0; i < remoteSources.length; i++) {
        const src = remoteSources[i];
        const startMarker = `===SPLIT_${src}===`;
        const startIdx = raw.indexOf(startMarker);
        if (startIdx === -1) {
          results[src] = { name: SOURCES[src].name, icon: SOURCES[src].icon, section: SOURCES[src].section, count: 0, items: [], error: 'marker not found' };
          continue;
        }
        
        // Find next marker
        let endIdx = raw.length;
        const nextSrc = remoteSources[i + 1];
        if (nextSrc) {
          const nextIdx = raw.indexOf(`===SPLIT_${nextSrc}===`);
          if (nextIdx > startIdx) endIdx = nextIdx;
        }
        const endEndIdx = raw.indexOf('===SPLIT_END===');
        if (endEndIdx > startIdx && endEndIdx < endIdx) endIdx = endEndIdx;
        
        const sourceRaw = raw.slice(startIdx + startMarker.length, endIdx).trim();
        try {
          const items = SOURCES[src].parse(sourceRaw).slice(0, count);
          results[src] = { name: SOURCES[src].name, icon: SOURCES[src].icon, section: SOURCES[src].section, count: items.length, items, error: null };
        } catch (err) {
          results[src] = { name: SOURCES[src].name, icon: SOURCES[src].icon, section: SOURCES[src].section, count: 0, items: [], error: `parse: ${err.message}` };
        }
      }
    } catch (err) {
      // Batch SSH failed entirely, fall back to individual
      process.stderr.write(`  ⚠️ Batch SSH failed: ${err.message}\n`);
      for (const src of remoteSources) {
        const cmd = SOURCES[src].buildCmd(count);
        const raw2 = executeCmd(cmd, false);
        if (!raw2) {
          results[src] = { name: SOURCES[src].name, icon: SOURCES[src].icon, section: SOURCES[src].section, count: 0, items: [], error: 'fetch failed' };
        } else {
          try {
            const items = SOURCES[src].parse(raw2).slice(0, count);
            results[src] = { name: SOURCES[src].name, icon: SOURCES[src].icon, section: SOURCES[src].section, count: items.length, items, error: null };
          } catch (err2) {
            results[src] = { name: SOURCES[src].name, icon: SOURCES[src].icon, section: SOURCES[src].section, count: 0, items: [], error: `parse: ${err2.message}` };
          }
        }
      }
    } finally {
      try { fs.unlinkSync(tmpFile); } catch {}
    }
  }

  // Local commands
  for (const src of localSources) {
    process.stderr.write(`📡 Local: ${SOURCES[src].name}...\n`);
    const cmd = SOURCES[src].buildCmd(count);
    const raw = executeCmd(cmd, true);
    if (!raw) {
      results[src] = { name: SOURCES[src].name, icon: SOURCES[src].icon, section: SOURCES[src].section, count: 0, items: [], error: 'fetch failed' };
    } else {
      try {
        const items = SOURCES[src].parse(raw).slice(0, count);
        results[src] = { name: SOURCES[src].name, icon: SOURCES[src].icon, section: SOURCES[src].section, count: items.length, items, error: null };
      } catch (err) {
        results[src] = { name: SOURCES[src].name, icon: SOURCES[src].icon, section: SOURCES[src].section, count: 0, items: [], error: `parse: ${err.message}` };
      }
    }
  }

  return results;
}

// ─── Format Markdown by Section ───
function formatMarkdown(results) {
  const sectionOrder = [
    { key: 'cn', title: '🇨🇳 国内市场' },
    { key: 'global', title: '🌍 全球市场' },
    { key: 'ai', title: '🤖 AI 专区' },
    { key: 'products', title: '🚀 新产品' },
  ];
  
  let md = `# 📰 每日搞钱情报\n\n`;
  md += `> 抓取时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n\n`;

  // Stats
  let totalItems = 0;
  let totalSources = 0;
  for (const data of Object.values(results)) {
    totalItems += data.count;
    if (data.count > 0) totalSources++;
  }
  md += `**${totalSources} 个数据源 | ${totalItems} 条新闻**\n\n---\n\n`;

  for (const { key, title } of sectionOrder) {
    const sectionSources = Object.entries(results).filter(([_, d]) => d.section === key);
    if (sectionSources.length === 0) continue;
    
    md += `## ${title}\n\n`;
    for (const [srcKey, data] of sectionSources) {
      if (data.error) {
        md += `### ${data.icon} ${data.name} ⚠️ ${data.error}\n\n`;
        continue;
      }
      md += `### ${data.icon} ${data.name}（${data.count} 条）\n\n`;
      for (const item of data.items) {
        md += `**${item.title}**\n`;
        if (item.digest && item.digest !== item.title) md += `${item.digest}\n`;
        if (item.time) md += `🕐 ${item.time}`;
        if (item.url) md += ` | [链接](${item.url})`;
        md += '\n\n';
      }
    }
    md += '---\n\n';
  }
  
  return md;
}

// ─── Main ───
function main() {
  const args = process.argv.slice(2);
  const flagAll = args.includes('--all');
  const sectionIdx = args.indexOf('--section');
  const sectionArg = sectionIdx !== -1 ? args[sectionIdx + 1] : null;
  const sourceIdx = args.indexOf('--source');
  const sourceArg = sourceIdx !== -1 ? args[sourceIdx + 1] : null;
  const countIdx = args.indexOf('--count');
  const count = countIdx !== -1 ? parseInt(args[countIdx + 1]) : DEFAULT_COUNT;
  const formatIdx = args.indexOf('--format');
  const format = formatIdx !== -1 ? args[formatIdx + 1] : 'json';

  let sourcesToFetch = [];
  if (flagAll) {
    sourcesToFetch = Object.keys(SOURCES);
  } else if (sectionArg && SECTIONS[sectionArg]) {
    sourcesToFetch = SECTIONS[sectionArg];
  } else if (sourceArg) {
    sourcesToFetch = [sourceArg];
  } else {
    console.error('Usage:');
    console.error('  node cn-news-fetcher.js --all');
    console.error('  node cn-news-fetcher.js --section <cn|global|ai|products>');
    console.error('  node cn-news-fetcher.js --source <sina|eastmoney|huxiu|36kr|qbitai|ainews|hfblog|ars|producthunt|hn>');
    console.error('Options: --count <N> --format <json|markdown>');
    process.exit(1);
  }

  process.stderr.write(`📡 Fetching ${sourcesToFetch.length} sources (batch SSH)...\n`);
  const results = batchSSHFetch(sourcesToFetch, count);
  
  // Summary to stderr
  for (const [src, data] of Object.entries(results)) {
    process.stderr.write(`  ${data.icon} ${data.name}: ${data.count} items${data.error ? ` ⚠️ ${data.error}` : ''}\n`);
  }

  if (format === 'markdown') {
    console.log(formatMarkdown(results));
  } else {
    console.log(JSON.stringify({
      fetchedAt: new Date().toISOString(),
      timezone: 'Asia/Shanghai',
      totalSources: Object.values(results).filter(d => d.count > 0).length,
      totalItems: Object.values(results).reduce((sum, d) => sum + d.count, 0),
      sources: results
    }, null, 2));
  }
}

main();
