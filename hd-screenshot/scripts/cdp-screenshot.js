#!/usr/bin/env node
/**
 * cdp-screenshot.js — 通过 CDP 协议截取 4K 高清网页截图
 * 
 * 用法: node cdp-screenshot.js <wsUrl> <outputDir> [segments] [width] [height]
 * 
 * 例: node cdp-screenshot.js "ws://127.0.0.1:18800/devtools/page/XXX" ./output 3
 */

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const wsUrl = process.argv[2];
const outputDir = process.argv[3] || '/tmp/screenshots';
const segments = parseInt(process.argv[4] || '2', 10);
const viewportWidth = parseInt(process.argv[5] || '1920', 10);
const viewportHeight = parseInt(process.argv[6] || '1080', 10);
const dpr = 2; // Device pixel ratio for 4K output

if (!wsUrl) {
  console.error('Usage: node cdp-screenshot.js <wsUrl> <outputDir> [segments] [width] [height]');
  console.error('');
  console.error('  wsUrl      CDP WebSocket URL (from browser open)');
  console.error('  outputDir  Output directory for screenshots');
  console.error('  segments   Number of scroll segments (default: 2)');
  console.error('  width      Viewport width (default: 1920)');
  console.error('  height     Viewport height (default: 1080)');
  process.exit(1);
}

// Ensure output directory exists
fs.mkdirSync(outputDir, { recursive: true });

const ws = new WebSocket(wsUrl);

let msgId = 0;
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const myId = ++msgId;
    const timeout = setTimeout(() => {
      ws.off('message', handler);
      reject(new Error(`Timeout waiting for response to ${method}`));
    }, 60000);

    function handler(data) {
      const msg = JSON.parse(data.toString());
      if (msg.id === myId) {
        clearTimeout(timeout);
        ws.off('message', handler);
        if (msg.error) {
          reject(new Error(`CDP error: ${JSON.stringify(msg.error)}`));
        } else {
          resolve(msg.result);
        }
      }
    }
    ws.on('message', handler);
    ws.send(JSON.stringify({ id: myId, method, params }));
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

ws.on('open', async () => {
  try {
    // Set viewport with high DPR
    await send('Emulation.setDeviceMetricsOverride', {
      width: viewportWidth,
      height: viewportHeight,
      deviceScaleFactor: dpr,
      mobile: false,
    });
    console.log(`Viewport: ${viewportWidth}x${viewportHeight} @${dpr}x (output: ${viewportWidth * dpr}x${viewportHeight * dpr})`);

    // Scroll to top first
    await send('Runtime.evaluate', { expression: 'window.scrollTo(0, 0)' });
    await sleep(1500);

    const files = [];

    for (let i = 0; i < segments; i++) {
      const scrollY = i * viewportHeight;

      // Scroll to position
      await send('Runtime.evaluate', { expression: `window.scrollTo(0, ${scrollY})` });
      await sleep(2000); // Wait for render after scroll

      // Capture screenshot
      const result = await send('Page.captureScreenshot', { format: 'png' });
      const buffer = Buffer.from(result.data, 'base64');
      const filename = `screenshot-${i + 1}.png`;
      const filepath = path.join(outputDir, filename);
      fs.writeFileSync(filepath, buffer);

      console.log(`  ${filename}: ${buffer.length} bytes (${(buffer.length / 1024).toFixed(0)}KB)`);
      files.push(filepath);
    }

    // Reset device metrics
    await send('Emulation.clearDeviceMetricsOverride');

    console.log(`\n✅ ${files.length} screenshots saved to ${outputDir}`);

    // Output JSON for scripting
    console.log(JSON.stringify({ files, width: viewportWidth * dpr, height: viewportHeight * dpr }));

    ws.close();
  } catch (err) {
    console.error('❌ Error:', err.message);
    ws.close();
    process.exit(1);
  }
});

ws.on('error', (err) => {
  console.error('❌ WebSocket error:', err.message);
  process.exit(1);
});
