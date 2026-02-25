#!/usr/bin/env bash
# add-task.sh — 新增任务到 task-queue.json + TASK.md + 刷新看板
# 用法: bash add-task.sh --id xxx --name "标题" --priority 50 --source "搞钱大王 02-20" --description "描述" [--type feature] [--deploy] [--depends other-id] [--blocked "原因"]

set -euo pipefail

TASK_QUEUE="/root/.openclaw/workspace/task-queue.json"
TASK_MD="/root/.openclaw/workspace/TASK.md"
SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Parse args
ID="" NAME="" PRIORITY="" SOURCE="" DESC="" TYPE="feature" DEPLOY="false" DEPENDS="" BLOCKED="" BLOCKED_REASON=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --id) ID="$2"; shift 2 ;;
    --name) NAME="$2"; shift 2 ;;
    --priority) PRIORITY="$2"; shift 2 ;;
    --source) SOURCE="$2"; shift 2 ;;
    --description|--desc) DESC="$2"; shift 2 ;;
    --type) TYPE="$2"; shift 2 ;;
    --deploy) DEPLOY="true"; shift ;;
    --depends) DEPENDS="$2"; shift 2 ;;
    --blocked) BLOCKED_REASON="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# Validate required fields
MISSING=""
[[ -z "$ID" ]] && MISSING="$MISSING --id"
[[ -z "$NAME" ]] && MISSING="$MISSING --name"
[[ -z "$PRIORITY" ]] && MISSING="$MISSING --priority"
[[ -z "$SOURCE" ]] && MISSING="$MISSING --source"

if [[ -n "$MISSING" ]]; then
  echo "❌ Missing required fields:$MISSING"
  echo "Usage: add-task.sh --id xxx --name '标题' --priority 50 --source '搞钱大王 02-20' [--description '描述'] [--type feature] [--deploy] [--depends other-id] [--blocked '原因']"
  exit 1
fi

# Check duplicate
if node -e "
const q = JSON.parse(require('fs').readFileSync('$TASK_QUEUE','utf8'));
if (q.tasks.some(t => t.id === '$ID')) { console.log('DUP'); process.exit(1); }
" 2>/dev/null; then
  : # no dup
else
  echo "❌ Task '$ID' already exists in task-queue.json"
  exit 1
fi

# Determine initial state
STATE="PROPOSED"
[[ -n "$BLOCKED_REASON" ]] && STATE="BLOCKED"

# Build depends_on array
DEPENDS_JSON="[]"
if [[ -n "$DEPENDS" ]]; then
  DEPENDS_JSON=$(echo "$DEPENDS" | tr ',' '\n' | sed 's/^/"/;s/$/"/' | paste -sd, | sed 's/^/[/;s/$/]/')
fi

NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Add to task-queue.json
node -e "
const fs = require('fs');
const q = JSON.parse(fs.readFileSync('$TASK_QUEUE', 'utf8'));

const task = {
  id: '$ID',
  task_id: '$ID',
  name: $(printf '%s' "$NAME" | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.stringify(d)))"),
  priority: $PRIORITY,
  state: '$STATE',
  type: '$TYPE',
  source: $(printf '%s' "$SOURCE" | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.stringify(d)))"),
  needs_deploy: $DEPLOY,
  deploy_targets: [],
  depends_on: $DEPENDS_JSON,
  blocked_by: null,
  blocked_reason: $(printf '%s' "$BLOCKED_REASON" | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(d?JSON.stringify(d):'null'))"),
  proposal: null,
  description: $(printf '%s' "$DESC" | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(d?JSON.stringify(d):'null'))"),
  created_at: '$NOW',
  started_at: null,
  finished_at: null,
  transitions: [],
  executions: [],
  verify_report: null
};

q.tasks.push(task);
fs.writeFileSync('$TASK_QUEUE', JSON.stringify(q, null, 2));
console.log('✅ Added to task-queue.json: ' + task.id + ' (P' + task.priority + ', ' + task.state + ')');
console.log('   Total tasks: ' + q.tasks.length);
"

# Add to TASK.md
STATUS_LABEL="活跃"
[[ "$STATE" == "BLOCKED" ]] && STATUS_LABEL="阻塞"

cat >> "$TASK_MD" << MDEOF

## [$STATUS_LABEL] $NAME
- id: $ID
- 来源: $SOURCE
- 时间: $(date +"%Y-%m-%d %H:%M" -d "$NOW" 2>/dev/null || date +"%Y-%m-%d %H:%M")
- 优先级: P$PRIORITY
- 目标: $DESC
- 状态: $STATE
### 执行记录
（待规划）
MDEOF
echo "✅ Added to TASK.md"

# Refresh dashboard
echo "📊 Refreshing dashboard..."
bash "$SKILL_DIR/scripts/refresh-dashboard.sh"
