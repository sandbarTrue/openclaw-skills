#!/usr/bin/env node
// anthropic-oauth-proxy — Connect OpenClaw to Claude via OAuth token
// Zero dependencies. Single file. Just works.
//
// Usage:
//   ANTHROPIC_OAUTH_TOKEN="sho_..." node proxy.js
//
// Optional (backup brain):
//   MINIMAX_API_KEY="sk-..." node proxy.js

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// ========== OPTIONAL: https-proxy-agent (for corporate proxies) ==========
let HttpsProxyAgent;
try {
  ({ HttpsProxyAgent } = require('https-proxy-agent'));
} catch (_) {
  try {
    // Fallback: try global node_modules
    const globalDir = path.join(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'https-proxy-agent');
    ({ HttpsProxyAgent } = require(globalDir));
  } catch (_2) {
    HttpsProxyAgent = null;
  }
}

// ========== PRIMARY: Claude (Anthropic OAuth) ==========
const PRIMARY_HOST = 'api.anthropic.com';
const PRIMARY_PORT = 443;
const PRIMARY_PATH_PREFIX = '';
const OAUTH_TOKEN = process.env.ANTHROPIC_OAUTH_TOKEN;

// ========== BACKUP: MiniMax (Anthropic-compatible endpoint) ==========
const BACKUP_HOST = process.env.MINIMAX_HOST || 'api.minimaxi.com';
const BACKUP_PORT = Number(process.env.MINIMAX_PORT || 443);
const BACKUP_PATH_PREFIX = process.env.MINIMAX_PATH_PREFIX || '/anthropic';
const BACKUP_API_KEY = process.env.MINIMAX_API_KEY || '';
const BACKUP_MODEL = process.env.MINIMAX_MODEL || 'MiniMax-M2.5';
const BACKUP_ENABLED = !!BACKUP_API_KEY;

// ========== CONFIG ==========
const PORT = Number(process.env.PROXY_PORT || 8089);
const HOST = process.env.PROXY_HOST || '127.0.0.1';
const COOLDOWN_MS = Number(process.env.COOLDOWN_MS || 5 * 60 * 1000);
const STATE_FILE = process.env.STATE_FILE || path.join(process.cwd(), 'brain-state.json');

// ========== STATE MANAGEMENT ==========
let currentBrain = 'primary'; // 'primary' | 'backup'
let lastSwitchTime = 0;
let primaryRateLimitedAt = 0;
let backupRateLimitedAt = 0;
let requestCount = { primary: 0, backup: 0 };
let errorCount = { primary: 0, backup: 0 };

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      if (data.currentBrain) currentBrain = data.currentBrain;
      if (data.primaryRateLimitedAt) primaryRateLimitedAt = data.primaryRateLimitedAt;
      if (data.backupRateLimitedAt) backupRateLimitedAt = data.backupRateLimitedAt;
      if (data.lastSwitchTime) lastSwitchTime = data.lastSwitchTime;
      console.log(`[STATE] Loaded: brain=${currentBrain}`);
    }
  } catch (e) {
    console.error(`[STATE] Load error: ${e.message}`);
  }
}

function saveState() {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify({
      currentBrain,
      lastSwitchTime,
      primaryRateLimitedAt,
      backupRateLimitedAt,
      requestCount,
      errorCount,
      updatedAt: new Date().toISOString()
    }, null, 2));
  } catch (e) {
    console.error(`[STATE] Save error: ${e.message}`);
  }
}

function switchBrain(reason) {
  if (!BACKUP_ENABLED) return; // No backup configured, can't switch
  const oldBrain = currentBrain;
  currentBrain = currentBrain === 'primary' ? 'backup' : 'primary';
  lastSwitchTime = Date.now();
  console.log(`\n🧠 [BRAIN SWITCH] ${oldBrain} → ${currentBrain} | Reason: ${reason}`);
  console.log(`   Time: ${new Date().toISOString()}\n`);
  saveState();
}

function maybeRecoverPrimary() {
  if (currentBrain === 'primary') return;
  const elapsed = Date.now() - primaryRateLimitedAt;
  if (elapsed > COOLDOWN_MS) {
    console.log(`[RECOVERY] Primary cooldown expired (${Math.round(elapsed / 1000)}s), switching back`);
    switchBrain('cooldown_expired');
  }
}

// ========== OUTBOUND PROXY (for corporate networks / VPN) ==========
const OUTBOUND_PROXY_URL =
  process.env.HTTPS_PROXY || process.env.https_proxy ||
  process.env.HTTP_PROXY || process.env.http_proxy || '';
const NO_PROXY = process.env.NO_PROXY || process.env.no_proxy || '';

function shouldBypassProxy(hostname) {
  if (!NO_PROXY) return false;
  const list = NO_PROXY.split(',').map(s => s.trim()).filter(Boolean);
  for (const entry of list) {
    if (entry === '*') return true;
    if (entry === hostname) return true;
    const normalized = entry.startsWith('.') ? entry.slice(1) : entry;
    if (hostname === normalized || hostname.endsWith(`.${normalized}`)) return true;
  }
  return false;
}

function getAgent(hostname) {
  if (OUTBOUND_PROXY_URL && HttpsProxyAgent && !shouldBypassProxy(hostname)) {
    return new HttpsProxyAgent(OUTBOUND_PROXY_URL);
  }
  return undefined;
}

// ========== BODY TRANSFORMS ==========

// Strip thinking/redacted_thinking blocks to avoid signature validation errors
// when switching between providers
function stripThinkingBlocks(bodyBuffer) {
  try {
    const body = JSON.parse(bodyBuffer.toString('utf8'));

    const strip = (content) => {
      if (!Array.isArray(content)) return content;
      return content.filter(b => {
        if (!b || typeof b !== 'object') return true;
        return b.type !== 'thinking' && b.type !== 'redacted_thinking';
      });
    };

    if (Array.isArray(body.messages)) {
      body.messages = body.messages.map(m => {
        if (!m || typeof m !== 'object') return m;
        return { ...m, content: strip(m.content) };
      });
    }
    if (Array.isArray(body.system)) {
      body.system = strip(body.system);
    }

    return Buffer.from(JSON.stringify(body), 'utf8');
  } catch (_) {
    return bodyBuffer;
  }
}

// Rewrite model name for backup provider
function rewriteBodyForBackup(bodyBuffer) {
  try {
    const body = JSON.parse(bodyBuffer.toString('utf8'));
    if (body.model) {
      body._original_model = body.model;
      body.model = BACKUP_MODEL;
    }
    return Buffer.from(JSON.stringify(body), 'utf8');
  } catch (_) {
    return bodyBuffer;
  }
}

function fixContentLength(headers, bodyBuffer) {
  delete headers['content-length'];
  delete headers['Content-Length'];
  delete headers['transfer-encoding'];
  delete headers['Transfer-Encoding'];
  headers['content-length'] = bodyBuffer.length;
}

// ========== BUILD REQUEST OPTIONS ==========
function buildRequest(req, bodyBuffer, target) {
  const isPrimary = target === 'primary';
  let body = bodyBuffer;

  body = stripThinkingBlocks(body);
  if (!isPrimary) {
    body = rewriteBodyForBackup(body);
  }

  const headers = { ...req.headers };

  if (isPrimary) {
    headers['host'] = PRIMARY_HOST;
    headers['authorization'] = `Bearer ${OAUTH_TOKEN}`;
    headers['anthropic-beta'] = 'claude-code-20250219,oauth-2025-04-20,fine-grained-tool-streaming-2025-05-14,interleaved-thinking-2025-05-14';
    headers['x-app'] = 'cli';
    headers['user-agent'] = 'claude-cli/2.1.2 (external, cli)';
    delete headers['x-api-key'];
    delete headers['X-Api-Key'];
  } else {
    headers['host'] = BACKUP_HOST;
    headers['x-api-key'] = BACKUP_API_KEY;
    delete headers['authorization'];
    delete headers['Authorization'];
  }

  if (!headers['anthropic-version'] && !headers['Anthropic-Version']) {
    headers['anthropic-version'] = '2023-06-01';
  }

  fixContentLength(headers, body);

  const targetHost = isPrimary ? PRIMARY_HOST : BACKUP_HOST;
  const targetPort = isPrimary ? PRIMARY_PORT : BACKUP_PORT;
  const targetPath = isPrimary ? req.url : (BACKUP_PATH_PREFIX + req.url);

  return {
    options: {
      hostname: targetHost,
      port: targetPort,
      path: targetPath,
      method: req.method,
      agent: getAgent(targetHost),
      headers
    },
    body,
    label: isPrimary ? '🔵 Claude' : '🟡 MiniMax'
  };
}

// ========== MAKE PROXIED REQUEST ==========
function proxyRequest(reqData, res, isRetry) {
  const { options, body, label } = reqData;
  const brainKey = currentBrain;

  requestCount[brainKey] = (requestCount[brainKey] || 0) + 1;
  console.log(`[${new Date().toISOString()}] ${label}${isRetry ? ' (retry)' : ''} ${options.method} ${options.path}`);

  const proxyReq = https.request(options, (proxyRes) => {
    const status = proxyRes.statusCode;

    // Rate limited — try failover
    if ((status === 429 || status === 529) && BACKUP_ENABLED && !isRetry) {
      console.log(`⚠️  [${label}] Rate limited (${status})`);
      errorCount[brainKey] = (errorCount[brainKey] || 0) + 1;

      if (currentBrain === 'primary') {
        primaryRateLimitedAt = Date.now();
      } else {
        backupRateLimitedAt = Date.now();
      }

      switchBrain(`${status}_rate_limit`);

      // Retry with new brain
      const retryData = buildRequest(
        { url: options.path.replace(BACKUP_PATH_PREFIX, ''), method: options.method, headers: options.headers },
        body,
        currentBrain
      );
      proxyRequest(retryData, res, true);
      return;
    }

    // Pass through (success or unrecoverable error)
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (e) => {
    console.error(`❌ [${label}] Error: ${e.message}`);
    errorCount[brainKey] = (errorCount[brainKey] || 0) + 1;

    if (BACKUP_ENABLED && !isRetry) {
      switchBrain(`connection_error: ${e.message}`);
      const retryData = buildRequest(
        { url: options.path.replace(BACKUP_PATH_PREFIX, ''), method: options.method, headers: options.headers },
        body,
        currentBrain
      );
      proxyRequest(retryData, res, true);
      return;
    }

    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end(`Proxy error: ${e.message}`);
  });

  if (body.length > 0) proxyReq.write(body);
  proxyReq.end();
}

// ========== HTTP SERVER ==========
if (!OAUTH_TOKEN) {
  console.error('❌ Missing ANTHROPIC_OAUTH_TOKEN environment variable.');
  console.error('   Get it: claude login → cat ~/.claude/credentials.json');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  // Health check
  if (req.method === 'GET' && (req.url === '/health' || req.url === '/healthz')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({
      ok: true,
      brain: currentBrain,
      backupEnabled: BACKUP_ENABLED,
      requestCount,
      errorCount,
      lastSwitch: lastSwitchTime ? new Date(lastSwitchTime).toISOString() : null
    }));
  }

  // Detailed status
  if (req.method === 'GET' && req.url === '/brain-status') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({
      currentBrain,
      backupEnabled: BACKUP_ENABLED,
      backupModel: BACKUP_ENABLED ? BACKUP_MODEL : null,
      primaryRateLimitedAt: primaryRateLimitedAt ? new Date(primaryRateLimitedAt).toISOString() : null,
      backupRateLimitedAt: backupRateLimitedAt ? new Date(backupRateLimitedAt).toISOString() : null,
      lastSwitchTime: lastSwitchTime ? new Date(lastSwitchTime).toISOString() : null,
      requestCount,
      errorCount,
      cooldownMs: COOLDOWN_MS
    }, null, 2));
  }

  // Check recovery before each request
  maybeRecoverPrimary();

  // Collect body
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const bodyBuffer = Buffer.concat(chunks);
    const reqData = buildRequest(req, bodyBuffer, currentBrain);
    proxyRequest(reqData, res, false);
  });
});

// ========== START ==========
loadState();

server.listen(PORT, HOST, () => {
  console.log(`\n🧠 Anthropic OAuth Proxy running on http://${HOST}:${PORT}`);
  console.log(`   Primary : Claude (${PRIMARY_HOST}) via OAuth`);
  if (BACKUP_ENABLED) {
    console.log(`   Backup  : ${BACKUP_MODEL} (${BACKUP_HOST})`);
  } else {
    console.log(`   Backup  : disabled (set MINIMAX_API_KEY to enable)`);
  }
  console.log(`   Cooldown: ${COOLDOWN_MS / 1000}s`);
  if (OUTBOUND_PROXY_URL && HttpsProxyAgent) {
    console.log(`   Outbound proxy: enabled`);
  }
  console.log('');
});
