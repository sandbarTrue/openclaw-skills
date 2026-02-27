#!/bin/bash
# feishu-chat 权限申请脚本
# 用法: bash apply-scopes.sh
# 自动从 ~/.openclaw/openclaw.json 读取凭据

set -euo pipefail

SCOPES=(
  "im:chat" "im:chat:create" "im:chat:update" "im:chat:readonly" "im:chat:read"
  "im:chat:delete" "im:chat.members:read" "im:chat.members:write_only"
  "im:chat.members:bot_access" "im:chat:operate_as_owner"
)

# 读取凭据
CONFIG_FILE="${HOME}/.openclaw/openclaw.json"
if [ -z "${FEISHU_APP_ID:-}" ] && [ -f "$CONFIG_FILE" ]; then
  FEISHU_APP_ID=$(grep -o '"appId"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" | head -1 | grep -o '"[^"]*"$' | tr -d '"')
fi

echo "=== feishu-chat 需要 ${#SCOPES[@]} 个飞书权限 ==="
echo ""
echo "在飞书控制台申请: https://open.feishu.cn/app/${FEISHU_APP_ID:-YOUR_APP_ID}/security-permissions"
echo ""
echo "逐个搜索并勾选以下 scope:"
echo ""
for scope in "${SCOPES[@]}"; do
  echo "  $scope"
done
echo ""
echo "💡 已有的权限会显示「已添加」，跳过即可"
