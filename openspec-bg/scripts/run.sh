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

    # Build the command that runs inside screen
    # Key: we source the model config to set env vars, then run the runner directly
    local SCREEN_CMD="
set -e
cd '${PROJECT}'

# Ensure node/npm available
export PATH=/root/.nvm/versions/node/v24.10.0/bin:\$PATH

# Source model environment variables
. '${OPENSPEC_CONFIG}' export '${MODEL}'

echo '=== OpenSpec Session Started ===' 
echo 'Session: ${SESSION}'
echo 'Project: ${PROJECT}'
echo 'Change:  ${CHANGE}'
echo 'Model:   ${MODEL}'
echo 'Time:    $(date)'
echo '================================'
echo ''

# Run the runner directly (non-interactive)
bash '${OPENSPEC_RUNNER}' ${RUNNER_ARGS}
exit_code=\$?

echo ''
echo '================================'
echo \"Session finished with exit code: \$exit_code\"
echo \"Time: \$(date)\"

if [ \$exit_code -ne 0 ]; then
    echo \"FAILED|\$exit_code|\$(date)\" > '${STATE_DIR}/${SESSION}.failed'
fi

exit \$exit_code
"

    # Start screen session with logging
    screen -L -Logfile "$LOG" -dmS "$SESSION" bash -c "$SCREEN_CMD"

    # Small delay to verify it started
    sleep 1

    # Verify screen session is running
    if screen -ls 2>/dev/null | grep -q "$SESSION"; then
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

Output Format:
  All commands output key=value pairs for easy parsing.
  Logs output is delimited by ---LOG_START--- and ---LOG_END--- markers.

Examples:
  # Start a task
  run.sh start --project /path/to/project --change fix-bug --model glm-5

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

# ============================================================================
# Main
# ============================================================================

action="${1:-help}"
shift || true

case "$action" in
    start)      cmd_start "$@" ;;
    status)     cmd_status "$@" ;;
    logs|log)   cmd_logs "$@" ;;
    stop)       cmd_stop "$@" ;;
    stop-all)   cmd_stop_all "$@" ;;
    list-models|models) cmd_list_models "$@" ;;
    help|--help|-h) cmd_help ;;
    *) die "Unknown command: $action. Run with 'help' for usage." ;;
esac
