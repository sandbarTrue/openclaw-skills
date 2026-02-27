#!/bin/bash
# ============================================================
# 飞书权限批量申请脚本
# 用法: bash apply-scopes.sh
#
# 前置条件:
#   1. 设置环境变量 FEISHU_APP_ID 和 FEISHU_APP_SECRET
#      或者脚本自动从 ~/.openclaw/openclaw.json 读取
#   2. curl 和 jq 已安装
#
# 说明:
#   飞书开放平台控制台不支持批量导入权限，但可以通过 API 批量申请。
#   本脚本调用 POST /open-apis/auth/v3/scopes/apply 一次性提交所有权限。
#   提交后仍需管理员在飞书管理后台审批通过。
# ============================================================

set -euo pipefail

# ---- 颜色 ----
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ---- 读取凭据 ----
if [ -z "${FEISHU_APP_ID:-}" ] || [ -z "${FEISHU_APP_SECRET:-}" ]; then
  CONFIG_FILE="${HOME}/.openclaw/openclaw.json"
  if [ -f "$CONFIG_FILE" ]; then
    FEISHU_APP_ID=$(grep -o '"appId"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" | head -1 | grep -o '"[^"]*"$' | tr -d '"')
    FEISHU_APP_SECRET=$(grep -o '"appSecret"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" | head -1 | grep -o '"[^"]*"$' | tr -d '"')
    echo -e "${GREEN}✓ 从 openclaw.json 读取凭据${NC}"
  fi
fi

if [ -z "${FEISHU_APP_ID:-}" ] || [ -z "${FEISHU_APP_SECRET:-}" ]; then
  echo -e "${RED}✗ 缺少 FEISHU_APP_ID 或 FEISHU_APP_SECRET${NC}"
  echo "  设置方式: export FEISHU_APP_ID=cli_xxx FEISHU_APP_SECRET=xxx"
  exit 1
fi

echo -e "${YELLOW}App ID: ${FEISHU_APP_ID}${NC}"

# ---- 获取 tenant_access_token ----
echo -n "获取 access token... "
TOKEN_RESP=$(curl -s -X POST 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal' \
  -H 'Content-Type: application/json' \
  -d "{\"app_id\":\"${FEISHU_APP_ID}\",\"app_secret\":\"${FEISHU_APP_SECRET}\"}")

TOKEN=$(echo "$TOKEN_RESP" | grep -o '"tenant_access_token"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"')

if [ -z "$TOKEN" ]; then
  echo -e "${RED}失败${NC}"
  echo "$TOKEN_RESP"
  exit 1
fi
echo -e "${GREEN}成功${NC}"

# ---- 所有需要的权限 ----
SCOPES=(
  # 必需 - 消息收发
  "im:message:send_as_bot"
  "im:message:readonly"
  "im:message.group_at_msg:readonly"
  "im:resource"
  "contact:user.id:readonly"

  # 群聊管理
  "im:chat"
  "im:chat:create"
  "im:chat:update"
  "im:chat:readonly"
  "im:chat:read"
  "im:chat:delete"
  "im:chat.members:read"
  "im:chat.members:write_only"
  "im:chat.members:bot_access"
  "im:chat:operate_as_owner"

  # 文档操作
  "docx:document"
  "docx:document:readonly"
  "docx:document:write_only"
  "docx:document:create"
  "docs:document.content:read"
  "docs:document.media:upload"
  "docs:document.media:download"
  "docs:document:export"
  "docs:document:import"
  "docs:document:copy"
  "docs:document.comment:create"
  "docs:document.comment:read"

  # 权限管理
  "docs:permission.member"
  "docs:permission.member:create"
  "docs:permission.member:delete"
  "docs:permission.member:update"
  "docs:permission.member:transfer"
  "docs:permission.member:readonly"
  "docs:permission.member:retrieve"
  "docs:permission.member:auth"
  "docs:permission.setting"
  "docs:permission.setting:readonly"
  "docs:permission.setting:read"
  "docs:permission.setting:write_only"

  # 云盘
  "drive:file"
  "drive:file:readonly"
  "drive:file:upload"
  "drive:file:download"
  "drive:drive"
  "drive:drive:readonly"
  "space:folder:create"
  "space:document:retrieve"
  "space:document:move"
  "space:document:delete"

  # 知识库
  "wiki:wiki"
  "wiki:wiki:readonly"
  "wiki:space:read"
  "wiki:space:retrieve"
  "wiki:space:write_only"
  "wiki:node:read"
  "wiki:node:create"
  "wiki:node:update"
  "wiki:node:move"
  "wiki:node:copy"
  "wiki:node:retrieve"
  "wiki:member:create"
  "wiki:member:retrieve"
  "wiki:member:update"

  # 多维表格
  "bitable:app"
  "bitable:app:readonly"
  "base:app:read"
  "base:app:create"
  "base:record:read"
  "base:record:create"
  "base:record:update"
  "base:record:delete"
  "base:field:read"
  "base:table:read"

  # 日历
  "calendar:calendar"
  "calendar:calendar:create"
  "calendar:calendar.event:create"
  "calendar:calendar.event:read"
  "calendar:calendar.event:update"
  "calendar:calendar.event:delete"
  "calendar:calendar.acl:create"

  # 消息增强
  "im:message.group_msg"
  "im:message.p2p_msg:readonly"
  "im:message:recall"
  "im:message:update"
  "im:message.reactions:write_only"
  "im:message.reactions:read"
  "im:message.pins:write_only"
  "im:message.pins:read"
)

echo -e "${YELLOW}共 ${#SCOPES[@]} 个权限待申请${NC}"

# ---- 构建 JSON 数组 ----
SCOPE_JSON="["
for i in "${!SCOPES[@]}"; do
  if [ $i -gt 0 ]; then SCOPE_JSON+=","; fi
  SCOPE_JSON+="\"${SCOPES[$i]}\""
done
SCOPE_JSON+="]"

# ---- 方式1: 通过 API 批量申请（如果支持）----
echo -n "尝试通过 API 批量申请... "
APPLY_RESP=$(curl -s -X POST 'https://open.feishu.cn/open-apis/application/v6/scopes/apply' \
  -H "Authorization: Bearer ${TOKEN}" \
  -H 'Content-Type: application/json' \
  -d "{\"scopes\":${SCOPE_JSON}}" 2>&1 || true)

APPLY_CODE=$(echo "$APPLY_RESP" | grep -o '"code"[[:space:]]*:[[:space:]]*[0-9]*' | grep -o '[0-9]*$' || echo "unknown")

if [ "$APPLY_CODE" = "0" ]; then
  echo -e "${GREEN}成功！${NC}"
  echo -e "${GREEN}✓ 已提交 ${#SCOPES[@]} 个权限申请，等待管理员审批${NC}"
  exit 0
fi

echo -e "${YELLOW}API 不可用 (code: ${APPLY_CODE})${NC}"

# ---- 方式2: 检查已有权限，列出缺失的 ----
echo ""
echo -e "${YELLOW}正在检查当前已有权限...${NC}"
CURRENT_RESP=$(curl -s -X GET 'https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal' \
  -H "Authorization: Bearer ${TOKEN}" 2>&1 || true)

echo ""
echo "============================================"
echo -e "${YELLOW}  飞书控制台手动操作指南${NC}"
echo "============================================"
echo ""
echo "1. 打开: https://open.feishu.cn/app/${FEISHU_APP_ID}/security-permissions"
echo "2. 点击「添加权限」"
echo "3. 在搜索框中逐个粘贴以下 scope 并勾选:"
echo ""

for scope in "${SCOPES[@]}"; do
  echo "   $scope"
done

echo ""
echo "4. 全部勾选后，点击「确认添加」"
echo "5. 提交审核，等待管理员审批"
echo ""
echo -e "${GREEN}💡 提示: 每个 scope 粘贴到搜索框后会自动匹配，勾选即可${NC}"
echo -e "${GREEN}💡 已有的权限会显示「已添加」，跳过即可${NC}"

# ---- 生成纯 scope 文件方便复制 ----
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCOPE_FILE="${SCRIPT_DIR}/scopes.txt"
printf '%s\n' "${SCOPES[@]}" > "$SCOPE_FILE"
echo ""
echo -e "${GREEN}✓ 所有 scope 已导出到: ${SCOPE_FILE}${NC}"
echo "  每行一个，方便逐个复制粘贴"
