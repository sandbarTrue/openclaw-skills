#!/usr/bin/env bash
# refresh-dashboard.sh — 刷新看板数据（collector + SCP + cache purge）
set -euo pipefail

WORKSPACE="/root/.openclaw/workspace"

echo "[refresh] Running stats collector..."
cd "$WORKSPACE" && node stats-collector.js 2>&1 | tail -3

echo "[refresh] Pushing to Spaceship..."
scp /tmp/wali-stats.json spaceship:~/junaitools.com/wali-api/stats.json 2>/dev/null

echo "[refresh] Purging CDN cache..."
curl -s -X PURGE 'https://junaitools.com/wali-api/stats.json' > /dev/null 2>&1 || true

echo "✅ Dashboard refreshed"
