#!/usr/bin/env bash
# update-task.sh — 更新任务状态/字段
# 用法: bash update-task.sh --id xxx --state REGISTERED [--priority 80] [--blocked "原因"] [--refresh]

set -euo pipefail

TASK_QUEUE="/root/.openclaw/workspace/task-queue.json"
SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"

ID="" STATE="" PRIORITY="" BLOCKED_REASON="" REFRESH="false"

while [[ $# -gt 0 ]]; do
  case $1 in
    --id) ID="$2"; shift 2 ;;
    --state) STATE="$2"; shift 2 ;;
    --priority) PRIORITY="$2"; shift 2 ;;
    --blocked) BLOCKED_REASON="$2"; shift 2 ;;
    --refresh) REFRESH="true"; shift ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

[[ -z "$ID" ]] && echo "❌ --id required" && exit 1

node -e "
const fs = require('fs');
const q = JSON.parse(fs.readFileSync('$TASK_QUEUE', 'utf8'));
const idx = q.tasks.findIndex(t => t.id === '$ID' || t.task_id === '$ID');
if (idx === -1) { console.error('❌ Task not found: $ID'); process.exit(1); }

const task = q.tasks[idx];
const now = new Date().toISOString();
const changes = [];

if ('$STATE') {
  const oldState = task.state;
  task.state = '$STATE';
  task.transitions = task.transitions || [];
  task.transitions.push({ from: oldState, to: '$STATE', at: now, evidence: 'manual-update' });
  changes.push('state: ' + oldState + ' → $STATE');
}

if ('$PRIORITY') {
  task.priority = parseInt('$PRIORITY');
  changes.push('priority: P$PRIORITY');
}

if ('$BLOCKED_REASON') {
  task.blocked_reason = '$BLOCKED_REASON';
  changes.push('blocked_reason updated');
}

fs.writeFileSync('$TASK_QUEUE', JSON.stringify(q, null, 2));
console.log('✅ Updated ' + task.id + ': ' + changes.join(', '));
"

if [[ "$REFRESH" == "true" ]]; then
  bash "$SKILL_DIR/scripts/refresh-dashboard.sh"
fi
