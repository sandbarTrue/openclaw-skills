# anthropic-oauth-proxy

Connect OpenClaw to Claude using your free Claude Pro/Max subscription — no API key needed.

## What It Does

A single-file Node.js proxy that sits between OpenClaw and Anthropic's API:

1. **OAuth Authentication** — Uses your Claude.ai OAuth token (from `claude` CLI) instead of a paid API key
2. **Auto-Failover** _(optional)_ — If Claude returns 429 (rate limited), automatically switches to a backup provider (MiniMax M2.5) and switches back after cooldown
3. **Corporate Proxy Support** _(optional)_ — Routes outbound requests through your company's HTTP proxy (e.g. behind a corporate firewall)
4. **Zero Required Dependencies** — Pure Node.js, no `npm install` needed. Optional deps enhance functionality

```
OpenClaw → localhost:8089 → [proxy] → api.anthropic.com (Claude)
                                   ↘ api.minimaxi.com (MiniMax, fallback)
```

## Quick Start

### 1. Get Your OAuth Token

```bash
# Install Claude CLI (if you don't have it)
npm install -g @anthropic-ai/claude-code

# Generate a long-lived token (valid for 1 year)
claude setup-token
# This opens a browser for OAuth, then prints the token directly
# No need to dig through credentials files

# Copy the token output — it starts with "sho_..." or similar
```

> **Why `setup-token` instead of `claude login`?**
> - `setup-token` creates a **1-year** token and prints it directly — perfect for servers
> - `claude login` stores a shorter-lived token in `~/.claude/credentials.json` — meant for local dev
> - For headless/CI/server deployments, `setup-token` is the recommended approach

### 2. Start the Proxy

```bash
# Required: set your OAuth token
export ANTHROPIC_OAUTH_TOKEN="<your-oauth-token>"

# Start
node proxy.js
# → 🧠 Brain Router Proxy running on http://127.0.0.1:8089
```

### 3. Configure OpenClaw

In your `openclaw.json`, set the model endpoint to the proxy:

```jsonc
{
  "ai": {
    "model": "anthropic-oauth-proxy/claude-opus-4-6",
    "providers": {
      "anthropic-oauth-proxy": {
        "kind": "anthropic",
        "baseUrl": "http://127.0.0.1:8089"
        // No apiKey needed — the proxy handles auth
      }
    }
  }
}
```

That's it. OpenClaw now uses your Claude subscription.

## Optional: Corporate Proxy (`https-proxy-agent`)

If your server is behind a corporate firewall/proxy (e.g. ByteDance CorpLink, corporate VPN), Node.js won't automatically route HTTPS requests through `HTTPS_PROXY`. Install `https-proxy-agent` to fix this:

```bash
npm install -g https-proxy-agent
```

Then set the proxy env var:

```bash
export HTTPS_PROXY="http://your-corp-proxy:8118"
# Optional: skip proxy for internal domains
export NO_PROXY=".internal.corp,.local"
```

The proxy auto-detects: if `https-proxy-agent` is installed AND `HTTPS_PROXY` is set, outbound requests go through your corporate proxy. Otherwise it connects directly — no errors, no config needed.

> **When do you need this?**
> - ✅ Server is behind corporate firewall (can't reach `api.anthropic.com` directly)
> - ✅ Company requires all outbound traffic through an HTTP proxy
> - ❌ Server has direct internet access → **skip this, you don't need it**

## Optional: MiniMax Backup Brain

If you want automatic failover when Claude is rate-limited:

```bash
export ANTHROPIC_OAUTH_TOKEN="<your-oauth-token>"
export MINIMAX_API_KEY="<your-minimax-key>"        # Get from minimaxi.com
export MINIMAX_MODEL="MiniMax-M2.5"                # Default model for fallback

node proxy.js
```

Without `MINIMAX_API_KEY`, the proxy works fine — it just won't have a backup and will pass through 429 errors to OpenClaw.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_OAUTH_TOKEN` | ✅ Yes | — | OAuth token from `claude setup-token` |
| `MINIMAX_API_KEY` | No | — | MiniMax API key for backup brain |
| `MINIMAX_MODEL` | No | `MiniMax-M2.5` | Model to use when on backup |
| `PROXY_PORT` | No | `8089` | Port the proxy listens on |
| `PROXY_HOST` | No | `127.0.0.1` | Host to bind to |
| `COOLDOWN_MS` | No | `300000` (5min) | Cooldown before switching back to primary |
| `STATE_FILE` | No | `./brain-state.json` | Where to persist failover state |
| `HTTPS_PROXY` | No | — | Corporate outbound proxy URL (requires `npm i -g https-proxy-agent`) |
| `NO_PROXY` | No | — | Comma-separated domains to bypass proxy (e.g. `.byted.org,.local`) |

## Endpoints

| Path | Description |
|------|-------------|
| `GET /health` | Health check + request counts |
| `GET /brain-status` | Current brain, failover state, stats |
| `* (everything else)` | Proxied to Anthropic/MiniMax API |

## How Failover Works

```
Claude 429 → switch to MiniMax → retry request
                                  ↓
              (5 min cooldown) → switch back to Claude
                                  ↓
MiniMax also 429 → pass error through (both down)
```

- On 429/529 from primary → switches to backup, retries the same request
- After cooldown (default 5 min) → automatically tries primary again
- State is persisted to disk so it survives restarts
- `/brain-status` shows current state at any time

## Running as a Service

```bash
# With systemd
cat > /etc/systemd/system/anthropic-proxy.service << 'EOF'
[Unit]
Description=Anthropic OAuth Proxy
After=network.target

[Service]
ExecStart=/usr/bin/node /path/to/proxy.js
Environment=ANTHROPIC_OAUTH_TOKEN=your-token-here
# Optional:
# Environment=MINIMAX_API_KEY=your-key-here
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl enable --now anthropic-proxy
```

Or simply with `nohup`:

```bash
ANTHROPIC_OAUTH_TOKEN="..." nohup node proxy.js > proxy.log 2>&1 &
```

## Why This Exists

Claude's API costs ~$15/MTok for Opus. A Claude Pro subscription ($20/mo) or Max ($100/mo) gives you generous usage. This proxy lets OpenClaw use that subscription instead of paying per-token API prices.

The MiniMax fallback is a bonus — when Claude rate-limits you (which happens on heavy usage), your AI assistant stays alive on a free backup brain instead of going silent.
