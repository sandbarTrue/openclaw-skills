#!/usr/bin/env bash
# feishu_chat.sh - 飞书群聊管理脚本
# 用法: bash feishu_chat.sh <action> [options]
#
# Actions:
#   create  --name <群名> [--user <open_id>] [--desc <描述>]
#   update  --chat <chat_id> [--name <群名>] [--desc <描述>] [--owner <open_id>]
#   info    --chat <chat_id>
#   members --chat <chat_id>
#   add     --chat <chat_id> --user <open_id> [--user <open_id2>]
#   remove  --chat <chat_id> --user <open_id>
#   list    [--page_size <n>] [--page_token <token>]
#   disband --chat <chat_id>

set -euo pipefail

# ========== 配置 ==========
OPENCLAW_CONFIG="${HOME}/.openclaw/openclaw.json"
FEISHU_API="https://open.feishu.cn/open-apis"

# ========== 工具函数 ==========
get_credentials() {
    APP_ID=$(python3 -c "import json; c=json.load(open('${OPENCLAW_CONFIG}')); print(c['channels']['feishu']['appId'])")
    APP_SECRET=$(python3 -c "import json; c=json.load(open('${OPENCLAW_CONFIG}')); print(c['channels']['feishu']['appSecret'])")
}

get_token() {
    get_credentials
    TOKEN=$(curl -s -X POST "${FEISHU_API}/auth/v3/tenant_access_token/internal" \
        -H 'Content-Type: application/json' \
        -d "{\"app_id\":\"${APP_ID}\",\"app_secret\":\"${APP_SECRET}\"}" \
        | python3 -c "import json,sys; print(json.load(sys.stdin)['tenant_access_token'])")
}

api_call() {
    local method="$1"
    local url="$2"
    shift 2
    curl -s -X "${method}" "${url}" \
        -H "Authorization: Bearer ${TOKEN}" \
        -H 'Content-Type: application/json' \
        "$@"
}

pretty_print() {
    python3 -m json.tool 2>/dev/null || cat
}

check_response() {
    local response="$1"
    local code=$(echo "$response" | python3 -c "import json,sys; print(json.load(sys.stdin).get('code', -1))" 2>/dev/null || echo "-1")
    if [ "$code" != "0" ]; then
        echo "❌ API 调用失败:" >&2
        echo "$response" | pretty_print >&2
        exit 1
    fi
    echo "$response" | pretty_print
}

# ========== 动作函数 ==========

action_create() {
    local name="" desc="" users=()
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --name) name="$2"; shift 2 ;;
            --desc) desc="$2"; shift 2 ;;
            --user) users+=("$2"); shift 2 ;;
            *) echo "Unknown option: $1" >&2; exit 1 ;;
        esac
    done

    if [ -z "$name" ]; then
        echo "❌ --name 必须指定" >&2; exit 1
    fi

    get_token

    # 构建 user_id_list JSON
    local user_list="[]"
    if [ ${#users[@]} -gt 0 ]; then
        user_list=$(printf '%s\n' "${users[@]}" | python3 -c "import json,sys; print(json.dumps([l.strip() for l in sys.stdin]))")
    fi

    # 构建请求体
    local body
    body=$(python3 -c "
import json
data = {
    'name': '${name}',
    'chat_mode': 'group',
    'chat_type': 'private',
    'user_id_list': ${user_list}
}
desc = '${desc}'
if desc:
    data['description'] = desc
print(json.dumps(data, ensure_ascii=False))
")

    local response
    response=$(api_call POST "${FEISHU_API}/im/v1/chats?user_id_type=open_id" -d "$body")
    check_response "$response"
}

action_update() {
    local chat_id="" name="" desc="" owner=""
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --chat) chat_id="$2"; shift 2 ;;
            --name) name="$2"; shift 2 ;;
            --desc) desc="$2"; shift 2 ;;
            --owner) owner="$2"; shift 2 ;;
            *) echo "Unknown option: $1" >&2; exit 1 ;;
        esac
    done

    if [ -z "$chat_id" ]; then
        echo "❌ --chat 必须指定" >&2; exit 1
    fi

    get_token

    local body
    body=$(python3 -c "
import json
data = {}
if '${name}': data['name'] = '${name}'
if '${desc}': data['description'] = '${desc}'
if '${owner}': data['owner_id'] = '${owner}'
print(json.dumps(data, ensure_ascii=False))
")

    local response
    response=$(api_call PUT "${FEISHU_API}/im/v1/chats/${chat_id}?user_id_type=open_id" -d "$body")
    check_response "$response"
}

action_info() {
    local chat_id=""
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --chat) chat_id="$2"; shift 2 ;;
            *) echo "Unknown option: $1" >&2; exit 1 ;;
        esac
    done

    if [ -z "$chat_id" ]; then
        echo "❌ --chat 必须指定" >&2; exit 1
    fi

    get_token
    local response
    response=$(api_call GET "${FEISHU_API}/im/v1/chats/${chat_id}?user_id_type=open_id")
    check_response "$response"
}

action_members() {
    local chat_id=""
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --chat) chat_id="$2"; shift 2 ;;
            *) echo "Unknown option: $1" >&2; exit 1 ;;
        esac
    done

    if [ -z "$chat_id" ]; then
        echo "❌ --chat 必须指定" >&2; exit 1
    fi

    get_token
    local response
    response=$(api_call GET "${FEISHU_API}/im/v1/chats/${chat_id}/members?user_id_type=open_id")
    check_response "$response"
}

action_add() {
    local chat_id="" users=()
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --chat) chat_id="$2"; shift 2 ;;
            --user) users+=("$2"); shift 2 ;;
            *) echo "Unknown option: $1" >&2; exit 1 ;;
        esac
    done

    if [ -z "$chat_id" ] || [ ${#users[@]} -eq 0 ]; then
        echo "❌ --chat 和 --user 必须指定" >&2; exit 1
    fi

    get_token

    local user_list
    user_list=$(printf '%s\n' "${users[@]}" | python3 -c "import json,sys; print(json.dumps([l.strip() for l in sys.stdin]))")

    local response
    response=$(api_call POST "${FEISHU_API}/im/v1/chats/${chat_id}/members?member_id_type=open_id" \
        -d "{\"id_list\": ${user_list}}")
    check_response "$response"
}

action_remove() {
    local chat_id="" users=()
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --chat) chat_id="$2"; shift 2 ;;
            --user) users+=("$2"); shift 2 ;;
            *) echo "Unknown option: $1" >&2; exit 1 ;;
        esac
    done

    if [ -z "$chat_id" ] || [ ${#users[@]} -eq 0 ]; then
        echo "❌ --chat 和 --user 必须指定" >&2; exit 1
    fi

    get_token

    local user_list
    user_list=$(printf '%s\n' "${users[@]}" | python3 -c "import json,sys; print(json.dumps([l.strip() for l in sys.stdin]))")

    local response
    response=$(api_call DELETE "${FEISHU_API}/im/v1/chats/${chat_id}/members?member_id_type=open_id" \
        -d "{\"id_list\": ${user_list}}")
    check_response "$response"
}

action_list() {
    local page_size=20 page_token=""
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --page_size) page_size="$2"; shift 2 ;;
            --page_token) page_token="$2"; shift 2 ;;
            *) echo "Unknown option: $1" >&2; exit 1 ;;
        esac
    done

    get_token

    local url="${FEISHU_API}/im/v1/chats?user_id_type=open_id&page_size=${page_size}"
    if [ -n "$page_token" ]; then
        url="${url}&page_token=${page_token}"
    fi

    local response
    response=$(api_call GET "$url")
    check_response "$response"
}

action_disband() {
    local chat_id=""
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --chat) chat_id="$2"; shift 2 ;;
            *) echo "Unknown option: $1" >&2; exit 1 ;;
        esac
    done

    if [ -z "$chat_id" ]; then
        echo "❌ --chat 必须指定" >&2; exit 1
    fi

    get_token
    local response
    response=$(api_call DELETE "${FEISHU_API}/im/v1/chats/${chat_id}")
    check_response "$response"
}

# ========== 主入口 ==========
if [ $# -eq 0 ]; then
    echo "用法: bash $0 <action> [options]"
    echo "Actions: create, update, info, members, add, remove, list, disband"
    exit 1
fi

ACTION="$1"
shift

case "$ACTION" in
    create)  action_create "$@" ;;
    update)  action_update "$@" ;;
    info)    action_info "$@" ;;
    members) action_members "$@" ;;
    add)     action_add "$@" ;;
    remove)  action_remove "$@" ;;
    list)    action_list "$@" ;;
    disband) action_disband "$@" ;;
    *)
        echo "❌ 未知动作: $ACTION" >&2
        echo "Actions: create, update, info, members, add, remove, list, disband" >&2
        exit 1
        ;;
esac
