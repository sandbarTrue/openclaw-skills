#!/usr/bin/env node
/**
 * setup-perms.js - 生成飞书权限一键开通方案
 * 
 * 用法:
 *   node setup-perms.js [--app-id <app_id>]
 * 
 * 输出:
 *   1. 权限管理页面直达链接
 *   2. 可在浏览器控制台运行的一键开通脚本
 *   3. Agent 浏览器自动化步骤指令
 */

const fs = require('fs');

// 飞书电子表格操作所需的全部权限
const REQUIRED_SCOPES = [
  'sheets:spreadsheet',
  'sheets:spreadsheet:create', 
  'sheets:spreadsheet:read',
  'sheets:spreadsheet:readonly',
  'sheets:spreadsheet:write_only',
  'sheets:spreadsheet.meta:read',
  'sheets:spreadsheet.meta:write_only',
  'drive:file',
  'drive:file:upload',
  'drive:file:readonly',
  'drive:file:download',
  'docs:permission.member',
  'docs:permission.member:create',
  'docs:permission.member:update',
  'docs:permission.member:delete',
  'docs:permission.member:retrieve',
  'docs:permission.setting',
  'docs:permission.setting:readonly',
  'docs:permission.setting:write_only',
];

// 搜索关键词（覆盖所有 scope）
const SEARCH_KEYWORDS = ['sheets:spreadsheet', 'drive:file', 'docs:permission'];

function getAppId() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--app-id' && args[i + 1]) return args[i + 1];
  }
  try {
    const config = JSON.parse(fs.readFileSync('/root/.openclaw/openclaw.json', 'utf8'));
    return config.channels?.feishu?.appId;
  } catch {}
  return null;
}

function generateConsoleScript() {
  // 生成一段可以在飞书开放平台权限页面控制台运行的 JS
  return `
// === feishu-sheet 一键开通权限 ===
// 在飞书开放平台的"权限管理"页面控制台运行此脚本
(async () => {
  const keywords = ${JSON.stringify(SEARCH_KEYWORDS)};
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  
  for (const keyword of keywords) {
    console.log('🔍 搜索: ' + keyword);
    
    // 找搜索框并输入
    const searchInput = document.querySelector('input[placeholder*="搜索"], input[placeholder*="Search"], input[type="search"]');
    if (!searchInput) { console.error('❌ 找不到搜索框'); continue; }
    
    // 清空并输入
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeInputValueSetter.call(searchInput, keyword);
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    searchInput.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(1500);
    
    // 找所有"开通"按钮并点击
    const buttons = [...document.querySelectorAll('button, span, div')].filter(el => {
      const text = el.textContent.trim();
      return text === '开通' || text === 'Activate' || text === 'Enable';
    });
    
    for (const btn of buttons) {
      btn.click();
      console.log('  ✅ 点击开通');
      await sleep(500);
      
      // 处理确认弹窗
      await sleep(300);
      const confirmBtn = document.querySelector('.arco-modal-footer button.arco-btn-primary, .arco-btn-primary');
      if (confirmBtn) { confirmBtn.click(); await sleep(300); }
    }
    
    if (buttons.length === 0) console.log('  ℹ️ 所有权限已开通');
    await sleep(1000);
  }
  
  console.log('\\n🎉 完成！请点击页面上的"创建版本并发布"按钮。');
})();
`.trim();
}

function main() {
  const appId = getAppId();
  if (!appId) {
    console.error('Error: No app_id found. Use --app-id <id> or configure openclaw.json');
    process.exit(1);
  }

  const url = `https://open.feishu.cn/app/${appId}/permission/scope/manage`;

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║     feishu-sheet 权限一键开通工具                ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log();
  console.log(`App ID: ${appId}`);
  console.log(`需要开通 ${REQUIRED_SCOPES.length} 个权限`);
  console.log();
  
  console.log('═══ 方案 A：浏览器控制台一键开通（推荐）═══');
  console.log();
  console.log(`1. 用管理员账号打开: ${url}`);
  console.log('2. 按 F12 打开控制台');
  console.log('3. 粘贴以下脚本并回车:');
  console.log();
  console.log('--- 复制以下内容 ---');
  console.log(generateConsoleScript());
  console.log('--- 复制到此为止 ---');
  console.log();
  console.log('4. 脚本运行完后，点击"创建版本并发布"');
  console.log('5. 运行: node feishu_sheet.js apply-perms');
  console.log();
  
  console.log('═══ 方案 B：手动开通 ═══');
  console.log();
  console.log(`打开: ${url}`);
  console.log('搜索以下关键词，逐个点击"开通":');
  for (const kw of SEARCH_KEYWORDS) {
    console.log(`  - ${kw}`);
  }
  console.log('开通后"创建版本并发布"');
  console.log();
  
  console.log('═══ 方案 C：Agent 浏览器自动化 ═══');
  console.log();
  console.log('需要用户通过 Chrome Extension (Browser Relay) 连接已登录的浏览器');
  console.log('Agent 操作步骤:');
  console.log(`  1. browser navigate: ${url}`);
  console.log('  2. 对每个关键词:');
  for (const kw of SEARCH_KEYWORDS) {
    console.log(`     - 搜索 "${kw}" → 点击所有"开通"按钮`);
  }
  console.log('  3. 点击"创建版本并发布"');
  console.log('  4. exec: node feishu_sheet.js apply-perms');
}

main();
