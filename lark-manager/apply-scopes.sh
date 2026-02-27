#!/bin/bash
# lark-manager 权限申请脚本
# 用法: bash apply-scopes.sh
# 自动从 ~/.openclaw/openclaw.json 读取凭据

set -euo pipefail

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

# 读取凭据
CONFIG_FILE="${HOME}/.openclaw/openclaw.json"
if [ -z "${FEISHU_APP_ID:-}" ] && [ -f "$CONFIG_FILE" ]; then
  FEISHU_APP_ID=$(grep -o '"appId"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" | head -1 | grep -o '"[^"]*"$' | tr -d '"')
fi

echo "=== lark-manager 需要 ${#SCOPES[@]} 个飞书权限 ==="
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
