#!/bin/bash
# OpenSpec Background Runner - Non-interactive wrapper for OpenClaw
# Bypasses all interactive prompts, runs directly in screen sessions
#
# Usage:
#   run.sh start --project <path> --change <name> [--model <id>] [--max-runs N] [--max-duration 2h]
#   run.sh status
#   run.sh logs [session-name] [--lines N]
#   run.sh stop [session-name]
#   run.sh list-models

set -euo pipefail

OPENSPEC_BG_DIR="/root/ai_magic/openspec-bg"
OPENSPEC_CONFIG="${OPENSPEC_BG_DIR}/openspec-config.sh"
OPENSPEC_RUNNER="${OPENSPEC_BG_DIR}/openspec-runner.sh"
CONFIG_FILE="$HOME/.openspec-config"
STATE_DIR="$HOME/.openspec-state"
LOG_DIR="/tmp/openspec-bg-logs"

# Ensure dirs exist
mkdir -p "$STATE_DIR" "$LOG_DIR"

# ============================================================================
# Helpers
# ============================================================================

die() { echo "ERROR: $*" >&2; exit 1; }

get_openspec_sessions() {
    screen -ls 2>/dev/null | grep -oP '\d+\.openspec-\S+' | sort || true
}

get_session_name_only() {
    # Input: "12345.openspec-xxx" -> "openspec-xxx"
    echo "$1" | cut -d. -f2-
}

find_session() {
    local target="$1"
    # Try exact match first
    local match
    match=$(screen -ls 2>/dev/null | grep -oP "\d+\.${target}\s" | awk '{print $1}' | head -1)
    if [ -n "$match" ]; then
        echo "$match"
        return 0
    fi
    # Try partial match
    match=$(screen -ls 2>/dev/null | grep -oP "\d+\.openspec-[^\s]*${target}[^\s]*\s" | awk '{print $1}' | head -1)
    if [ -n "$match" ]; then
        echo "$match"
        return 0
    fi
    return 1
}

# ============================================================================
# Commands
# ============================================================================

cmd_start() {
    local PROJECT="" CHANGE="" MODEL="" MAX_RUNS="" MAX_DURATION="" VERBOSE=""

    # Parse args
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --project)    PROJECT="$2"; shift 2 ;;
            --change)     CHANGE="$2"; shift 2 ;;
            --model)      MODEL="$2"; shift 2 ;;
            --max-runs)   MAX_RUNS="$2"; shift 2 ;;
            --max-duration) MAX_DURATION="$2"; shift 2 ;;
            --verbose|-v) VERBOSE="-v"; shift ;;
            *) die "Unknown start option: $1" ;;
        esac
    done

    # Validate required args
    [ -z "$PROJECT" ] && die "Missing --project <path>"
    [ -z "$CHANGE" ] && die "Missing --change <name>"
    [ -d "$PROJECT" ] || die "Project directory does not exist: $PROJECT"

    # Validate change dir exists
    local change_dir="${PROJECT}/openspec/changes/${CHANGE}"
    [ -d "$change_dir" ] || die "Change directory does not exist: $change_dir"
    [ -f "${change_dir}/tasks.md" ] || die "tasks.md not found in: $change_dir"

    # Default model from config
    if [ -z "$MODEL" ]; then
        if [ -f "$CONFIG_FILE" ]; then
            MODEL=$(bash "$OPENSPEC_CONFIG" current 2>/dev/null || echo "")
        fi
        [ -z "$MODEL" ] && die "No model specified and no default model configured. Use --model <id> or run: bash $OPENSPEC_BG_DIR/openspec-bg.sh init"
    fi

    # Verify model exists in config
    if [ -f "$CONFIG_FILE" ]; then
        if ! bash "$OPENSPEC_CONFIG" export "$MODEL" >/dev/null 2>&1; then
            die "Model '$MODEL' not found in config. Available models: $(bash "$OPENSPEC_CONFIG" list 2>/dev/null)"
        fi
    fi

    # Generate session name
    local ts=$(date +%s)
    local short_change=$(echo "$CHANGE" | head -c 30)
    local SESSION="openspec-${short_change}-${ts}"
    local LOG="${LOG_DIR}/${SESSION}.log"

    # Build runner args
    local RUNNER_ARGS="--change $CHANGE"
    [ -n "$MAX_RUNS" ] && RUNNER_ARGS="$RUNNER_ARGS --max-runs $MAX_RUNS"
    [ -n "$MAX_DURATION" ] && RUNNER_ARGS="$RUNNER_ARGS --max-duration $MAX_DURATION"
    [ -n "$VERBOSE" ] && RUNNER_ARGS="$RUNNER_ARGS -v"

    # Determine if we need to switch user (root -> zhoujun.sandbar)
    local RUNNER_USER=""
    local SU_PREFIX=""
    if [ "$(id -u)" -eq 0 ]; then
        # Running as root, need to switch to zhoujun.sandbar for claude
        RUNNER_USER="zhoujun.sandbar"
        SU_PREFIX="su -l zhoujun.sandbar -c"
    fi

    # === KEY FIX: Generate temp script BEFORE screen, not inside screen ===
    # su -l is a login shell that clears ALL env vars.
    # Nested heredoc inside double-quoted SCREEN_CMD doesn't work.
    # Solution: generate the script file here, with env vars baked in.

    # Source model config to get env vars
    . "${OPENSPEC_CONFIG}" export "${MODEL}"

    local SCREEN_SCRIPT="${LOG_DIR}/${SESSION}-run.sh"
    cat > "$SCREEN_SCRIPT" << SCRIPTEOF
#!/bin/bash
# 不用 set -e，因为需要捕获 exit_code 后执行通知

echo '=== OpenSpec Session Started ==='
echo 'Session: ${SESSION}'
echo 'Project: ${PROJECT}'
echo 'Change:  ${CHANGE}'
echo 'Model:   ${MODEL}'
echo "Time:    \$(date)"
echo '================================'
echo ''

# If running as root, switch to zhoujun.sandbar via baked temp script
if [ \$(id -u) -eq 0 ]; then
    TMPRUN="/tmp/openspec-run-\$\$.sh"
    cat > "\$TMPRUN" << 'INNEREOF'
#!/bin/bash
export PATH=/root/.nvm/versions/node/v24.10.0/bin:\$PATH
unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY
unset ANTHROPIC_AUTH_TOKEN CLAUDE_CODE_OAUTH_TOKEN
export DISABLE_TELEMETRY=1
export DISABLE_NONESSENTIAL_TRAFFIC=1
export DISABLE_ERROR_REPORTING=1
INNEREOF
    echo "export ANTHROPIC_BASE_URL='${ANTHROPIC_BASE_URL}'" >> "\$TMPRUN"
    echo "export ANTHROPIC_API_KEY='${ANTHROPIC_API_KEY}'" >> "\$TMPRUN"
    echo "export OPENSPEC_MODEL='${MODEL}'" >> "\$TMPRUN"
    echo "cd '${PROJECT}'" >> "\$TMPRUN"
    echo "exec bash '${OPENSPEC_RUNNER}' ${RUNNER_ARGS}" >> "\$TMPRUN"
    chmod +x "\$TMPRUN"
    su -l zhoujun.sandbar -c "bash \$TMPRUN"
    exit_code=\$?
    rm -f "\$TMPRUN" || true
else
    export PATH=/root/.nvm/versions/node/v24.10.0/bin:\$PATH
    unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY
    cd '${PROJECT}'
    bash '${OPENSPEC_RUNNER}' ${RUNNER_ARGS}
    exit_code=\$?
fi

echo ''
echo '================================'
echo "Session finished with exit code: \$exit_code"
echo "Time: \$(date)"

# Write task-done callback file for heartbeat polling
DONE_FILE="/tmp/task-done-${SESSION}.json"
if [ \$exit_code -ne 0 ]; then
    echo "FAILED|\$exit_code|\$(date)" > '${STATE_DIR}/${SESSION}.failed'
    echo "{\"session\":\"${SESSION}\",\"status\":\"failed\",\"exit_code\":\$exit_code,\"timestamp\":\"\$(date -Iseconds)\",\"project\":\"${PROJECT}\",\"type\":\"openspec\"}" > "\$DONE_FILE"
    bash /root/.openclaw/workspace/scripts/task-complete-notify.sh "${SESSION}" "failed" "${PROJECT}" "openspec" >> /tmp/task-notify.log 2>&1
else
    echo "{\"session\":\"${SESSION}\",\"status\":\"success\",\"exit_code\":0,\"timestamp\":\"\$(date -Iseconds)\",\"project\":\"${PROJECT}\",\"type\":\"openspec\"}" > "\$DONE_FILE"
    bash /root/.openclaw/workspace/scripts/task-complete-notify.sh "${SESSION}" "success" "${PROJECT}" "openspec" >> /tmp/task-notify.log 2>&1
fi

exit \$exit_code
SCRIPTEOF
    chmod +x "$SCREEN_SCRIPT"

    local SCREEN_CMD="bash '${SCREEN_SCRIPT}'"

    # Start screen session with logging
    screen -L -Logfile "$LOG" -dmS "$SESSION" bash -c "$SCREEN_CMD"

    # Small delay to verify it started
    sleep 2

    # Verify screen session is running
    if screen -ls 2>/dev/null | grep -q "$SESSION" || [ -s "$LOG" ]; then
        echo "SESSION=${SESSION}"
        echo "LOG=${LOG}"
        echo "PROJECT=${PROJECT}"
        echo "CHANGE=${CHANGE}"
        echo "MODEL=${MODEL}"
        echo "STATUS=started"
    else
        echo "STATUS=failed"
        echo "ERROR=Screen session failed to start"
        # Show log if available
        if [ -f "$LOG" ]; then
            echo "---LOG---"
            cat "$LOG"
        fi
        exit 1
    fi
}

cmd_status() {
    local sessions
    sessions=$(get_openspec_sessions)

    if [ -z "$sessions" ]; then
        echo "STATUS=no_sessions"
        
        # Check for failed sessions
        local failed_count=0
        for f in "$STATE_DIR"/*.failed; do
            [ -f "$f" ] && failed_count=$((failed_count + 1))
        done
        
        if [ "$failed_count" -gt 0 ]; then
            echo "FAILED_COUNT=$failed_count"
        fi
        return 0
    fi

    echo "STATUS=active"
    local count=0
    while IFS= read -r session; do
        [ -z "$session" ] && continue
        count=$((count + 1))
        local name=$(get_session_name_only "$session")
        local pid=$(echo "$session" | cut -d. -f1)

        # Check if attached or detached
        local state="detached"
        screen -ls 2>/dev/null | grep "$session" | grep -q "Attached" && state="attached"

        echo "SESSION_${count}=${name}"
        echo "SESSION_${count}_PID=${pid}"
        echo "SESSION_${count}_STATE=${state}"

        # Check log file
        local log_file="${LOG_DIR}/${name}.log"
        if [ -f "$log_file" ]; then
            echo "SESSION_${count}_LOG=${log_file}"
            # Get last meaningful line
            local last_line
            last_line=$(tail -5 "$log_file" 2>/dev/null | grep -v '^$' | tail -1 || echo "")
            echo "SESSION_${count}_LAST=${last_line}"
        fi
    done <<< "$sessions"
    echo "SESSION_COUNT=${count}"
}

cmd_logs() {
    local target=""
    local lines=80

    # Parse args - session name is positional (non-flag), --lines is optional
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --lines|-n) lines="$2"; shift 2 ;;
            -*) shift ;;  # skip unknown flags
            *)
                if [ -z "$target" ]; then
                    target="$1"
                fi
                shift
                ;;
        esac
    done

    # If no target specified, find the most recent session
    if [ -z "$target" ]; then
        # Try active sessions first
        local latest_session
        latest_session=$(get_openspec_sessions | tail -1)
        
        if [ -n "$latest_session" ]; then
            target=$(get_session_name_only "$latest_session")
        else
            # Fall back to most recent log file
            local latest_log
            latest_log=$(ls -t "$LOG_DIR"/openspec-*.log 2>/dev/null | head -1)
            if [ -n "$latest_log" ]; then
                target=$(basename "$latest_log" .log)
            else
                echo "ERROR=no_logs_found"
                return 1
            fi
        fi
    fi

    # Find the log file
    local log_file="${LOG_DIR}/${target}.log"
    
    # Also check state dir
    if [ ! -f "$log_file" ]; then
        log_file="${STATE_DIR}/${target}.log"
    fi

    if [ ! -f "$log_file" ]; then
        echo "ERROR=log_not_found"
        echo "TARGET=${target}"
        echo "SEARCHED=${LOG_DIR}/${target}.log and ${STATE_DIR}/${target}.log"
        
        # List available logs
        echo "---AVAILABLE_LOGS---"
        ls -t "$LOG_DIR"/openspec-*.log 2>/dev/null | head -5 || echo "(none in $LOG_DIR)"
        ls -t "$STATE_DIR"/openspec-*.log 2>/dev/null | head -5 || echo "(none in $STATE_DIR)"
        return 1
    fi

    echo "LOG_FILE=${log_file}"
    echo "TARGET=${target}"
    echo "---LOG_START---"
    tail -"$lines" "$log_file" 2>/dev/null || echo "(empty)"
    echo "---LOG_END---"
}

cmd_stop() {
    local target="${1:-}"

    if [ -z "$target" ]; then
        # Stop the most recent session
        local latest_session
        latest_session=$(get_openspec_sessions | tail -1)
        
        if [ -z "$latest_session" ]; then
            echo "STATUS=no_sessions"
            return 0
        fi
        
        target=$(get_session_name_only "$latest_session")
    fi

    # Find session
    local session_id
    if session_id=$(find_session "$target"); then
        screen -X -S "$session_id" quit 2>/dev/null || true
        echo "STOPPED=${target}"
        echo "STATUS=ok"
    else
        echo "STATUS=not_found"
        echo "TARGET=${target}"
    fi
}

cmd_stop_all() {
    local sessions
    sessions=$(get_openspec_sessions)

    if [ -z "$sessions" ]; then
        echo "STATUS=no_sessions"
        return 0
    fi

    local count=0
    while IFS= read -r session; do
        [ -z "$session" ] && continue
        screen -X -S "$session" quit 2>/dev/null || true
        local name=$(get_session_name_only "$session")
        echo "STOPPED_$((count+1))=${name}"
        count=$((count + 1))
    done <<< "$sessions"
    echo "STOPPED_COUNT=${count}"
    echo "STATUS=ok"
}

cmd_list_models() {
    if [ ! -f "$CONFIG_FILE" ]; then
        echo "STATUS=no_config"
        echo "HINT=Run: bash $OPENSPEC_BG_DIR/openspec-bg.sh init"
        return 1
    fi

    bash "$OPENSPEC_CONFIG" list 2>/dev/null
    echo ""
    echo "CURRENT=$(bash "$OPENSPEC_CONFIG" current 2>/dev/null)"
}

cmd_help() {
    cat << 'EOF'
OpenSpec Background Runner - OpenClaw Skill Wrapper

Usage:
  run.sh start --project <path> --change <name> [--model <id>] [options]
  run.sh run-direct --project <path> --task "任务描述" [--model <id>]
  run.sh status
  run.sh logs [session-name] [--lines N]
  run.sh stop [session-name]
  run.sh stop-all
  run.sh list-models
  run.sh help

Start Options:
  --project <path>       Project root directory (required)
  --change <name>        OpenSpec change ID (required)
  --model <id>           Model ID from config (default: from ~/.openspec-config)
  --max-runs <n>         Max successful task completions
  --max-duration <dur>   Max duration (e.g., 2h, 30m)
  --verbose, -v          Enable verbose output

Run-Direct Options:
  --project <path>       Project root directory (required)
  --task <description>   Task description for Claude Code (required)
  --model <id>           Model ID (default: glm-5)

Output Format:
  All commands output key=value pairs for easy parsing.
  Logs output is delimited by ---LOG_START--- and ---LOG_END--- markers.

Examples:
  # Start a task with openspec change
  run.sh start --project /path/to/project --change fix-bug --model glm-5

  # Run a direct task without openspec structure
  run.sh run-direct --project /path/to/project --task "修复登录页面的按钮样式问题"

  # Run with specific model
  run.sh run-direct -p /path/to/project -t "添加日志功能" -m glm-5

  # Check status
  run.sh status

  # View logs (last 80 lines)
  run.sh logs

  # View more log lines
  run.sh logs openspec-fix-bug-12345 --lines 200

  # Stop latest session
  run.sh stop
EOF
}

cmd_run_direct() {
    local PROJECT="" TASK="" TASK_FILE="" MODEL="glm-5"

    # Parse args
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --project|-p)  PROJECT="$2"; shift 2 ;;
            --task|-t)     TASK="$2"; shift 2 ;;
            --task-file|-f) TASK_FILE="$2"; shift 2 ;;
            --model|-m)    MODEL="$2"; shift 2 ;;
            *) die "Unknown run-direct option: $1" ;;
        esac
    done

    # Validate required args
    [ -z "$PROJECT" ] && die "Missing --project <path>"
    [ -d "$PROJECT" ] || die "Project directory does not exist: $PROJECT"

    # Read task from file if --task-file provided
    if [ -n "$TASK_FILE" ]; then
        [ -f "$TASK_FILE" ] || die "Task file does not exist: $TASK_FILE"
        TASK=$(cat "$TASK_FILE")
    fi
    [ -z "$TASK" ] && die "Missing --task or --task-file"

    # Verify model exists in config
    if [ -f "$CONFIG_FILE" ]; then
        if ! bash "$OPENSPEC_CONFIG" export "$MODEL" >/dev/null 2>&1; then
            die "Model '$MODEL' not found in config. Available models: $(bash "$OPENSPEC_CONFIG" list 2>/dev/null)"
        fi
    fi

    # =========================================================================
    # PRE-CHECK: 流程合规检查 — 必须有 proposal + TASK.md 注册
    # =========================================================================
    # 从任务文件或任务描述中提取 task_id
    local TASK_ID=""
    if [ -n "$TASK_FILE" ]; then
        TASK_ID=$(grep -m1 '^- task_id:' "$TASK_FILE" 2>/dev/null | sed 's/^- task_id:\s*//' || true)
    fi
    if [ -z "$TASK_ID" ]; then
        TASK_ID=$(echo "$TASK" | grep -m1 'task_id:' 2>/dev/null | sed 's/.*task_id:\s*//' | tr -d ' ' || true)
    fi
    if [ -n "$TASK_ID" ]; then
        local PRE_CHECK="/root/.openclaw/workspace/scripts/pre-check.sh"
        if [ -f "$PRE_CHECK" ]; then
            if ! bash "$PRE_CHECK" "$TASK_ID" "$PROJECT"; then
                die "流程合规检查未通过！请先创建提案。"
            fi
        fi
    else
        echo "[warn] 未检测到 task_id，跳过流程检查（建议在任务描述中加入 '- task_id: xxx'）"
    fi

    # Generate session name
    local ts=$(date +%s)
    local SESSION="direct-${ts}"
    local LOG="${LOG_DIR}/${SESSION}.log"

    # =========================================================================
    # KEY FIX: Write ALL dynamic content to files, never embed in shell strings.
    # This prevents special characters in TASK from being interpreted by bash.
    # =========================================================================

    # 1. Write task prompt to a file (safe from shell interpretation)
    local PROMPT_FILE="${LOG_DIR}/${SESSION}-prompt.txt"
    cat > "$PROMPT_FILE" << 'PROMPT_HEADER'
你是一个编码专家。请完成以下任务：

PROMPT_HEADER
    # Append the actual task (cat preserves all special chars)
    printf '%s' "$TASK" >> "$PROMPT_FILE"
    cat >> "$PROMPT_FILE" << 'PROMPT_FOOTER'

## ⚠️ 强制要求：使用 Conductor Orchestrator Skills

你必须使用 Conductor Orchestrator 来完成此任务。步骤：
1. 先读取 `~/.claude/plugins/conductor-orchestrator-superpowers/skills/using-superpowers/SKILL.md`
2. 使用 Evaluate-Loop 流程：Plan → Evaluate → Execute → Evaluate → Fix → Complete
3. 使用 systematic-debugging skill 处理 bug
4. 使用 test-driven-development skill 写测试
5. 使用 verification-before-completion skill 做完成前验证

## 完成时必须输出以下报告（否则验收不通过）：
```
[Conductor Report]
- Skills used: [列出使用了哪些 skills]
- Evaluate-Loop rounds: N
- Quality gate: PASS/FAIL
- Files modified: [列出修改的文件]
```

请在项目目录中完成此任务。完成后简要说明你做了什么修改。
PROMPT_FOOTER

    # 2. Read model env vars directly from config file (reliable, no subshell issues)
    local API_BASE="" API_KEY="" API_MODEL=""
    if [ -f "$CONFIG_FILE" ]; then
        source "$CONFIG_FILE"
        local count="${MODEL_COUNT:-0}"
        local found=0
        for (( i=0; i<count; i++ )); do
            local id_var="MODEL_${i}_ID"
            local url_var="MODEL_${i}_URL"
            local key_var="MODEL_${i}_KEY"
            local model_var="MODEL_${i}_MODEL"
            if [ "${!id_var}" = "$MODEL" ]; then
                API_BASE="${!url_var}"
                API_KEY="${!key_var}"
                API_MODEL="${!model_var:-$MODEL}"
                found=1
                break
            fi
        done
        [ "$found" -eq 0 ] && die "Model '$MODEL' not found in $CONFIG_FILE"
    else
        die "Config file not found: $CONFIG_FILE"
    fi
    [ -z "$API_BASE" ] && die "No API URL configured for model $MODEL"
    [ -z "$API_KEY" ] && die "No API key configured for model $MODEL"

    # 3. Write the runner script to a file (no heredoc-in-heredoc issues)
    local RUNNER_SCRIPT="${LOG_DIR}/${SESSION}-runner.sh"
    cat > "$RUNNER_SCRIPT" << 'RUNNER_STATIC'
#!/bin/bash
set -e
export PATH=/root/.nvm/versions/node/v24.10.0/bin:$PATH
unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY
unset ANTHROPIC_AUTH_TOKEN CLAUDE_CODE_OAUTH_TOKEN
export DISABLE_TELEMETRY=1
export DISABLE_NONESSENTIAL_TRAFFIC=1
export DISABLE_ERROR_REPORTING=1
RUNNER_STATIC

    # Append dynamic env vars (written separately to avoid quoting issues)
    echo "export ANTHROPIC_BASE_URL='${API_BASE}'" >> "$RUNNER_SCRIPT"
    echo "export ANTHROPIC_API_KEY='${API_KEY}'" >> "$RUNNER_SCRIPT"
    echo "cd '${PROJECT}'" >> "$RUNNER_SCRIPT"
    # Read prompt from file into variable, then pass to claude -p
    # This avoids shell escaping issues since the file content is loaded at runtime
    cat >> "$RUNNER_SCRIPT" << CLAUDE_CMD
PROMPT_TEXT=\$(cat '${PROMPT_FILE}')
exec claude -p "\$PROMPT_TEXT" --model '${API_MODEL}' --dangerously-skip-permissions --output-format json
CLAUDE_CMD
    chmod +x "$RUNNER_SCRIPT"

    # 4. Write the screen wrapper script
    local SCREEN_SCRIPT="${LOG_DIR}/${SESSION}-screen.sh"
    cat > "$SCREEN_SCRIPT" << SCREENEOF
#!/bin/bash
# 不用 set -e，需要捕获 exit_code 后执行通知

# Export vars for auto-backfill
export TASK_ID="${TASK_ID:-}"
export LOG_FILE="${LOG}"
export SESSION_NAME="${SESSION}"
export PROJECT_PATH="${PROJECT}"

echo '=== Claude Code Direct Run ==='
echo "Session: ${SESSION}"
echo "Project: ${PROJECT}"
echo "Model:   ${MODEL}"
echo "Task:    (see ${PROMPT_FILE})"
echo "Time:    \$(date)"
echo '================================'
echo ''

# Run the runner (switch user if root)
if [ \$(id -u) -eq 0 ]; then
    su -l zhoujun.sandbar -c "bash '${RUNNER_SCRIPT}'"
else
    bash "${RUNNER_SCRIPT}"
fi
exit_code=\$?

echo ''
echo '================================'
echo "Session finished with exit code: \$exit_code"
echo "Time: \$(date)"

# Write task-done callback file for heartbeat polling
# Extract rich info from Claude Code JSON output (last line of log)
DONE_FILE="/tmp/task-done-${SESSION}.json"
TASK_TITLE=""
RESULT_SUMMARY=""
TOTAL_COST=""
DURATION_MS=""
NUM_TURNS=""

# Try to parse Claude Code's JSON output from the log
CC_OUTPUT=\$(tail -20 "${LOG}" | grep -m1 '{"type":"result"' || true)
if [ -n "\$CC_OUTPUT" ]; then
    TASK_TITLE=\$(echo "\$CC_OUTPUT" | python3 -c "import json,sys; d=json.load(sys.stdin); r=d.get('result',''); print(r[:100].split(chr(10))[0])" 2>/dev/null || true)
    RESULT_SUMMARY=\$(echo "\$CC_OUTPUT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('result','')[:500])" 2>/dev/null || true)
    TOTAL_COST=\$(echo "\$CC_OUTPUT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('total_cost_usd',0))" 2>/dev/null || true)
    DURATION_MS=\$(echo "\$CC_OUTPUT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('duration_ms',0))" 2>/dev/null || true)
    NUM_TURNS=\$(echo "\$CC_OUTPUT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('num_turns',0))" 2>/dev/null || true)
fi

# Fallback task_title: read from prompt file first line
if [ -z "\$TASK_TITLE" ] && [ -f "${PROMPT_FILE}" ]; then
    TASK_TITLE=\$(head -10 "${PROMPT_FILE}" | grep -v "^#\|^$\|你是\|强制" | head -1 | head -c 100 || true)
fi
[ -z "\$TASK_TITLE" ] && TASK_TITLE="${MODEL} 任务 ($(basename ${PROJECT}))"

# Write rich task-done JSON using python3 (safe from shell escaping)
python3 -c "
import json, sys
data = {
    'session': '${SESSION}',
    'status': 'failed' if int('\${exit_code:-1}') != 0 else 'success',
    'exit_code': int('\${exit_code:-1}'),
    'timestamp': '$(date -Iseconds)',
    'project': '${PROJECT}',
    'type': 'run-direct',
    'task_title': '''\$TASK_TITLE'''.strip()[:200] if '''\$TASK_TITLE'''.strip() else '${MODEL} 任务',
    'total_cost_usd': float('\$TOTAL_COST') if '\$TOTAL_COST' and '\$TOTAL_COST' != '0' else None,
    'duration_ms': int('\$DURATION_MS') if '\$DURATION_MS' and '\$DURATION_MS' != '0' else None,
    'num_turns': int('\$NUM_TURNS') if '\$NUM_TURNS' and '\$NUM_TURNS' != '0' else None,
    'result': '''\$RESULT_SUMMARY''' if '''\$RESULT_SUMMARY''' else None,
}
# Remove None values
data = {k:v for k,v in data.items() if v is not None}
with open('\$DONE_FILE', 'w') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
" 2>/dev/null

# Fallback: if python3 failed, write minimal JSON
if [ ! -f "\$DONE_FILE" ]; then
    if [ \$exit_code -ne 0 ]; then
        echo "FAILED|\$exit_code|\$(date)" > '${STATE_DIR}/${SESSION}.failed'
        echo '{"session":"${SESSION}","status":"failed","exit_code":'\$exit_code',"timestamp":"'\$(date -Iseconds)'","project":"${PROJECT}","type":"run-direct","task_title":"${MODEL} 任务 (失败)"}' > "\$DONE_FILE"
    else
        echo '{"session":"${SESSION}","status":"success","exit_code":0,"timestamp":"'\$(date -Iseconds)'","project":"${PROJECT}","type":"run-direct","task_title":"${MODEL} 任务"}' > "\$DONE_FILE"
    fi
fi

bash /root/.openclaw/workspace/scripts/task-complete-notify.sh "${SESSION}" "\$([ \$exit_code -ne 0 ] && echo failed || echo success)" "${PROJECT}" "run-direct" >> /tmp/task-notify.log 2>&1

# Auto-backfill execution record to task-queue.json
if [ -n "\$TASK_ID" ]; then
    echo "[auto-backfill] Writing execution record for task: \$TASK_ID"
    python3 /root/.openclaw/workspace/scripts/auto-backfill.py 2>/dev/null || true
fi

exit \$exit_code
SCREENEOF
    chmod +x "$SCREEN_SCRIPT"

    # 5. Start screen session executing the wrapper script
    screen -L -Logfile "$LOG" -dmS "$SESSION" bash "$SCREEN_SCRIPT"

    # Small delay to verify it started
    sleep 2

    # Verify screen session is running
    if screen -ls 2>/dev/null | grep -q "$SESSION" || [ -s "$LOG" ]; then
        echo "SESSION=${SESSION}"
        echo "LOG=${LOG}"
        echo "PROJECT=${PROJECT}"
        echo "MODEL=${MODEL}"
        echo "TASK=${TASK}"
        echo "STATUS=started"
    else
        echo "STATUS=failed"
        echo "ERROR=Screen session failed to start"
        # Show log if available
        if [ -f "$LOG" ]; then
            echo "---LOG---"
            cat "$LOG"
        fi
        exit 1
    fi
}

# ============================================================================
# Main
# ============================================================================

action="${1:-help}"
shift || true

case "$action" in
    start)      cmd_start "$@" ;;
    run-direct) cmd_run_direct "$@" ;;
    status)     cmd_status "$@" ;;
    logs|log)   cmd_logs "$@" ;;
    stop)       cmd_stop "$@" ;;
    stop-all)   cmd_stop_all "$@" ;;
    list-models|models) cmd_list_models "$@" ;;
    help|--help|-h) cmd_help ;;
    *) die "Unknown command: $action. Run with 'help' for usage." ;;
esac
