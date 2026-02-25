#!/bin/bash
# Neko Pet CLI Tool
# 管理猫咪状态文件

set -e

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="$SCRIPT_DIR/../data"
STATE_FILE="$DATA_DIR/state.json"
MEMORY_FILE="$DATA_DIR/memory.json"

# 等级阈值
LEVEL_THRESHOLDS=(0 50 150 500)
LEVEL_NAMES=("Kitten" "Young Cat" "Adult Cat" "Wise Cat")

# 食物加成
declare -A FOOD_BONUS
FOOD_BONUS[fish]=30
FOOD_BONUS[meat]=20
FOOD_BONUS[milk]=15
FOOD_BONUS[treat]=10

# JSON 操作函数（使用 jq 或 python 兜底）
json_get() {
    local file="$1"
    local key="$2"
    if command -v jq &> /dev/null; then
        jq -r ".$key // empty" "$file" 2>/dev/null || echo ""
    else
        python3 -c "import json; d=json.load(open('$file')); print(d.get('$key', ''))" 2>/dev/null || echo ""
    fi
}

json_set() {
    local file="$1"
    local key="$2"
    local value="$3"
    if command -v jq &> /dev/null; then
        local tmp=$(mktemp)
        jq --arg k "$key" --arg v "$value" 'if $v | test("^[0-9]+$") then .[$k] = ($v | tonumber) else .[$k] = $v end' "$file" > "$tmp" && mv "$tmp" "$file"
    else
        python3 -c "
import json
with open('$file', 'r') as f:
    d = json.load(f)
try:
    d['$key'] = int('$value')
except ValueError:
    d['$key'] = '$value'
with open('$file', 'w') as f:
    json.dump(d, f, indent=2)
"
    fi
}

json_set_multiple() {
    local file="$1"
    shift
    if command -v jq &> /dev/null; then
        local tmp=$(mktemp)
        local jq_cmd="."
        for arg in "$@"; do
            local key="${arg%%=*}"
            local value="${arg#*=}"
            if [[ "$value" =~ ^[0-9]+$ ]]; then
                jq_cmd="$jq_cmd | .[\"$key\"] = $value"
            else
                jq_cmd="$jq_cmd | .[\"$key\"] = \"$value\""
            fi
        done
        jq "$jq_cmd" "$file" > "$tmp" && mv "$tmp" "$file"
    else
        python3 -c "
import json, sys
with open('$file', 'r') as f:
    d = json.load(f)
args = $@
for arg in args:
    k, v = arg.split('=', 1)
    try:
        d[k] = int(v)
    except ValueError:
        d[k] = v
with open('$file', 'w') as f:
    json.dump(d, f, indent=2)
" "$@"
    fi
}

# 计算等级
calculate_level() {
    local xp=$1
    local level=1
    for i in "${!LEVEL_THRESHOLDS[@]}"; do
        if (( xp >= LEVEL_THRESHOLDS[$i] )); then
            level=$((i + 1))
        fi
    done
    echo $level
}

# 根据饥饿度计算情绪
calculate_mood() {
    local hunger=$1
    local last_interaction=$2
    local now=$(date +%s)
    local hours_diff=$(( (now - last_interaction) / 3600 ))
    
    if (( hunger < 10 )); then
        echo "angry"
    elif (( hunger < 30 )); then
        echo "hungry"
    elif (( hours_diff > 8 )); then
        echo "sleepy"
    else
        echo "idle"
    fi
}

# 初始化
cmd_init() {
    local name="${1:-Neko}"
    local now=$(date +%s)
    
    mkdir -p "$DATA_DIR"
    
    if [[ ! -f "$STATE_FILE" ]]; then
        cat > "$STATE_FILE" << EOF
{
  "name": "$name",
  "mood": "curious",
  "hunger": 80,
  "xp": 0,
  "level": 1,
  "lastInteraction": $now,
  "totalInteractions": 0,
  "createdAt": $now,
  "personality": "default"
}
EOF
        echo "Created $STATE_FILE"
    else
        echo "State file already exists"
    fi
    
    if [[ ! -f "$MEMORY_FILE" ]]; then
        cat > "$MEMORY_FILE" << EOF
{
  "conversations": [],
  "preferences": {},
  "memories": [],
  "lastUpdated": $now
}
EOF
        echo "Created $MEMORY_FILE"
    else
        echo "Memory file already exists"
    fi
    
    echo "Neko pet initialized with name: $name"
}

# 查看状态
cmd_status() {
    if [[ ! -f "$STATE_FILE" ]]; then
        echo "Error: State file not found. Run 'neko.sh init' first."
        exit 1
    fi
    
    local name=$(json_get "$STATE_FILE" "name")
    local mood=$(json_get "$STATE_FILE" "mood")
    local hunger=$(json_get "$STATE_FILE" "hunger")
    local xp=$(json_get "$STATE_FILE" "xp")
    local level=$(json_get "$STATE_FILE" "level")
    local last_interaction=$(json_get "$STATE_FILE" "lastInteraction")
    
    echo "name=$name mood=$mood hunger=$hunger xp=$xp level=$level lastInteraction=$last_interaction"
}

# 喂猫
cmd_feed() {
    if [[ ! -f "$STATE_FILE" ]]; then
        echo "Error: State file not found. Run 'neko.sh init' first."
        exit 1
    fi
    
    local food="${1:-fish}"
    local bonus=${FOOD_BONUS[$food]:-10}
    
    local hunger=$(json_get "$STATE_FILE" "hunger")
    local xp=$(json_get "$STATE_FILE" "xp")
    local now=$(date +%s)
    
    # 计算新值
    local new_hunger=$((hunger + bonus))
    if (( new_hunger > 100 )); then
        new_hunger=100
    fi
    
    local new_xp=$((xp + 2))
    local new_level=$(calculate_level $new_xp)
    
    # 更新状态
    json_set_multiple "$STATE_FILE" "hunger=$new_hunger" "xp=$new_xp" "level=$new_level" "mood=happy" "lastInteraction=$now"
    
    echo "hunger=$new_hunger mood=happy xp=$new_xp"
}

# 摸猫
cmd_pet() {
    if [[ ! -f "$STATE_FILE" ]]; then
        echo "Error: State file not found. Run 'neko.sh init' first."
        exit 1
    fi
    
    local xp=$(json_get "$STATE_FILE" "xp")
    local now=$(date +%s)
    
    local new_xp=$((xp + 3))
    local new_level=$(calculate_level $new_xp)
    
    json_set_multiple "$STATE_FILE" "xp=$new_xp" "level=$new_level" "mood=lovey" "lastInteraction=$now"
    
    echo "mood=lovey xp=$new_xp"
}

# 玩游戏
cmd_play() {
    if [[ ! -f "$STATE_FILE" ]]; then
        echo "Error: State file not found. Run 'neko.sh init' first."
        exit 1
    fi
    
    local xp=$(json_get "$STATE_FILE" "xp")
    local now=$(date +%s)
    
    local new_xp=$((xp + 5))
    local new_level=$(calculate_level $new_xp)
    
    json_set_multiple "$STATE_FILE" "xp=$new_xp" "level=$new_level" "mood=happy" "lastInteraction=$now"
    
    echo "mood=happy xp=$new_xp"
}

# 更新状态（计算时间衰减）
cmd_update() {
    if [[ ! -f "$STATE_FILE" ]]; then
        echo "Error: State file not found. Run 'neko.sh init' first."
        exit 1
    fi
    
    local hunger=$(json_get "$STATE_FILE" "hunger")
    local xp=$(json_get "$STATE_FILE" "xp")
    local level=$(json_get "$STATE_FILE" "level")
    local last_interaction=$(json_get "$STATE_FILE" "lastInteraction")
    local name=$(json_get "$STATE_FILE" "name")
    local now=$(date +%s)
    
    # 计算饥饿衰减（每小时 -5）
    local hours_diff=$(( (now - last_interaction) / 3600 ))
    local hunger_decay=$((hours_diff * 5))
    local new_hunger=$((hunger - hunger_decay))
    if (( new_hunger < 0 )); then
        new_hunger=0
    fi
    
    # 计算情绪
    local new_mood=$(calculate_mood $new_hunger $last_interaction)
    
    # 更新状态
    json_set_multiple "$STATE_FILE" "hunger=$new_hunger" "mood=$new_mood" "lastInteraction=$now"
    
    echo "hunger=$new_hunger mood=$new_mood"
}

# 生成 Canvas URL
cmd_canvas_url() {
    if [[ ! -f "$STATE_FILE" ]]; then
        echo "Error: State file not found. Run 'neko.sh init' first."
        exit 1
    fi
    
    local name=$(json_get "$STATE_FILE" "name")
    local mood=$(json_get "$STATE_FILE" "mood")
    local hunger=$(json_get "$STATE_FILE" "hunger")
    local xp=$(json_get "$STATE_FILE" "xp")
    local level=$(json_get "$STATE_FILE" "level")
    
    # 获取 HTML 文件的绝对路径
    local html_path="$SCRIPT_DIR/../neko-canvas.html"
    local abs_path=$(cd "$(dirname "$html_path")" && pwd)/$(basename "$html_path")
    
    echo "file://$abs_path?mood=$mood&hunger=$hunger&xp=$xp&level=$level&name=$name"
}

# 帮助信息
cmd_help() {
    cat << EOF
Neko Pet CLI Tool

Usage: neko.sh <command> [options]

Commands:
  init [--name NAME]     Initialize neko pet (default name: Neko)
  status                 Show current status
  feed [food]            Feed neko (fish|meat|milk|treat, default: fish)
  pet                    Pet neko
  play                   Play with neko
  update                 Update state (calculate hunger decay)
  canvas-url             Generate canvas URL for visualization

Examples:
  neko.sh init --name Mimi
  neko.sh status
  neko.sh feed fish
  neko.sh pet
  neko.sh canvas-url
EOF
}

# 解析 init 参数
parse_init_args() {
    local name="Neko"
    shift
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --name|-n)
                name="$2"
                shift 2
                ;;
            *)
                shift
                ;;
        esac
    done
    echo "$name"
}

# 主入口
case "${1:-}" in
    init)
        name=$(parse_init_args "$@")
        cmd_init "$name"
        ;;
    status)
        cmd_status
        ;;
    feed)
        cmd_feed "${2:-fish}"
        ;;
    pet)
        cmd_pet
        ;;
    play)
        cmd_play
        ;;
    update)
        cmd_update
        ;;
    canvas-url)
        cmd_canvas_url
        ;;
    help|--help|-h)
        cmd_help
        ;;
    *)
        cmd_help
        exit 1
        ;;
esac
