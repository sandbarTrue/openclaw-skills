#!/bin/bash
# lark-manager 权限自动申请脚本
# 用法: bash apply-scopes.sh
# 自动从 ~/.openclaw/openclaw.json 读取凭据，通过 API 批量申请权限

set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

SCOPES=(
  "docx:document" "docx:document:readonly" "docx:document:write_only" "docx:document:create"
  "docs:document.content:read" "docs:document.media:upload" "docs:document.media:download"
  "docs:document:export" "docs:document:import" "docs:document:copy"
  "docs:document.comment:create" "docs:document.comment:read"
  "docs:permission.member" "docs:permission.member:create" "docs:permission.member:delete"
  "docs:permission.member:update" "docs:permission.member:transfer" "docs:permission.member:readonly"
  "docs:permission.member:retrieve" "docs:permission.member:auth"
  "docs:permission.setting" "docs:permission.setting:readonly" "docs:permission.setting:read" "docs:permission.setting:write_only"
  "drive:file" "drive:file:readonly" "drive:file:upload" "drive:file:download"
  "drive:drive" "drive:drive:readonly"
  "space:folder:create" "space:document:retrieve" "space:document:move" "space:document:delete"
)

# ---- 读取凭据 ----
CONFIG_FILE="${HOME}/.openclaw/openclaw.json"
if [ -z "${FEISHU_APP_ID:-}" ] && [ -f "$CONFIG_FILE" ]; then
  FEISHU_APP_ID=$(grep -o '"appId"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" | head -1 | grep -o '"[^"]*"$' | tr -d '"')
  FEISHU_APP_SECRET=$(grep -o '"appSecret"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" | head -1 | grep -o '"[^"]*"$' | tr -d '"')
fi

if [ -z "${FEISHU_APP_ID:-}" ] || [ -z "${FEISHU_APP_SECRET:-}" ]; then
  echo -e "${RED}✗ 缺少凭据。设置: export FEISHU_APP_ID=cli_xxx FEISHU_APP_SECRET=xxx${NC}"
  exit 1
fi

echo -e "${YELLOW}lark-manager: 申请 ${#SCOPES[@]} 个飞书权限${NC}"

# ---- 获取 token ----
TOKEN=$(curl -s -X POST 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal' \
  -H 'Content-Type: application/json' \
  -d "{\"app_id\":\"${FEISHU_APP_ID}\",\"app_secret\":\"${FEISHU_APP_SECRET}\"}" \
  | grep -o '"tenant_access_token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo -e "${RED}✗ 获取 token 失败，检查 App ID/Secret${NC}"
  exit 1
fi

# ---- 构建 JSON ----
SCOPE_JSON="["
for i in "${!SCOPES[@]}"; do
  [ $i -gt 0 ] && SCOPE_JSON+=","
  SCOPE_JSON+="\"${SCOPES[$i]}\""
done
SCOPE_JSON+="]"

# ---- 调用 API 申请 ----
RESP=$(curl -s -X POST 'https://open.feishu.cn/open-apis/application/v6/scopes/apply' \
  -H "Authorization: Bearer ${TOKEN}" \
  -H 'Content-Type: application/json' \
  -d "{\"scopes\":${SCOPE_JSON}}")

CODE=$(echo "$RESP" | grep -o '"code":[0-9]*' | grep -o '[0-9]*')

case "${CODE}" in
  0)
    echo -e "${GREEN}✓ 权限申请已提交！等待管理员审批。${NC}"
    ;;
  212002)
    echo -e "${GREEN}✓ 所有权限已就绪（无需额外申请）${NC}"
    ;;
  *)
    echo -e "${YELLOW}⚠ API 返回 code=${CODE}，需手动申请${NC}"
    echo ""
    echo "打开: https://open.feishu.cn/app/${FEISHU_APP_ID}/security-permissions"
    echo "搜索并勾选以下 scope:"
    echo ""
    for scope in "${SCOPES[@]}"; do echo "  $scope"; done
    ;;
esac
