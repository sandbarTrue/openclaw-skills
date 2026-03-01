---
name: feishu-sheet
description: 飞书电子表格API操作（创建/读写/样式/下拉列表/权限）。当需要创建电子表格、写入数据、设置下拉列表（含彩色标签）、冻结行列、设置列宽、批量样式时使用此skill。
---

# Feishu Sheet - 飞书电子表格操作

## 何时使用
- 创建飞书电子表格
- 写入/读取表格数据
- 创建多 sheet（工作表）
- 设置下拉列表（含彩色标签 ⚠️ 见坑点）
- 设置表头样式（背景色、字体、冻结行）
- 设置列宽
- 管理权限（添加协作者、公开分享）

## 脚本

### 一站式创建表格
```bash
node SKILL_DIR/scripts/feishu_sheet.js create --title "表格标题" --config config.json
```

### 单独操作
```bash
# 写入数据
node SKILL_DIR/scripts/feishu_sheet.js write --ss <token> --sheet <sheetId> --range "A1:H12" --file data.json

# 添加彩色下拉
node SKILL_DIR/scripts/feishu_sheet.js dropdown --ss <token> --sheet <sheetId> --range "C2:C12" \
  --values '["待办","采购","预定"]' --colors '["#E8F5E9","#FFF3E0","#E3F2FD"]'

# 设置表头样式
node SKILL_DIR/scripts/feishu_sheet.js header --ss <token> --sheet <sheetId> --range "A1:H1" \
  --bg "#4472C4" --fg "#FFFFFF" --bold --freeze-row 1

# 设置列宽
node SKILL_DIR/scripts/feishu_sheet.js colwidth --ss <token> --sheet <sheetId> --widths '50,220,70,70,100,90,80,200'

# 设置权限
node SKILL_DIR/scripts/feishu_sheet.js permission --ss <token> --user <open_id> --perm full_access
node SKILL_DIR/scripts/feishu_sheet.js permission --ss <token> --public anyone_editable
```

## ⚠️ 关键坑点（踩过的坑，必读）

### 1. 下拉颜色必须用 `colors` 数组，不是 `colorValueMap`
```json
// ✅ 正确：colors 数组，和 conditionValues 一一对应
{
  "options": {
    "highlightValidData": true,
    "colors": ["#FFCDD2", "#FFF9C4", "#A5D6A7"]
  }
}

// ❌ 错误：colorValueMap 对象（报错 90204）
{
  "options": {
    "highlightValidData": true,
    "colorValueMap": {"未开始": "#FFCDD2"}
  }
}
```
**错误信息**：`conditionValues should be one-to-one match with colors when highlightValidData is true`
**根因**：API接受 `colors` 数组格式，`colorValueMap` 只在 GET 返回时出现。

### 2. 创建彩色下拉前必须先删除同范围的旧 validation
如果已有无颜色的 validation，POST 新的带颜色的会失败。先 DELETE 再 POST。

### 3. DELETE validation 格式
```
DELETE /open-apis/sheets/v2/spreadsheets/{ss}/dataValidation/{id}?sheetId={sheetId}
```
注意：DELETE 返回成功但可能没真删，需 GET 验证。

### 4. 表头样式用 appendStyle
```
PUT /open-apis/sheets/v2/spreadsheets/{ss}/style
Body: { appendStyle: { range, style: { bold, backColor, foreColor } } }
```

### 5. 冻结行列
```
POST /sheets_batch_update
Body: { requests: [{ updateSheet: { properties: { sheetId, frozenRowCount: 1 } } }] }
```

## 常用颜色参考

| 用途 | 颜色值 | 效果 |
|------|--------|------|
| 绿色背景 | #E8F5E9, #C8E6C9, #A5D6A7 | 完成/共同 |
| 橙色背景 | #FFF3E0 | 采购 |
| 蓝色背景 | #E3F2FD, #BBDEFB, #B3E5FC | 预定/男方/已预定 |
| 紫色背景 | #F3E5F5 | 确认 |
| 粉色背景 | #F8BBD0 | 女方 |
| 红色背景 | #FFCDD2 | 未开始/未购买 |
| 黄色背景 | #FFF9C4 | 进行中 |
| 表头蓝 | #4472C4 (背景) + #FFFFFF (字体) | 表头 |

## 所需权限

电子表格操作需要以下飞书应用权限（scope）：
- `sheets:spreadsheet` — 读写电子表格
- `sheets:spreadsheet:create` — 创建电子表格
- `sheets:spreadsheet:read` / `sheets:spreadsheet:readonly` — 读取
- `sheets:spreadsheet:write_only` — 写入
- `sheets:spreadsheet.meta:read` / `write_only` — 元数据
- `drive:file` — 文件操作（权限管理需要）
- `docs:permission.member:*` — 权限管理

### 一键 setup（推荐）
```bash
node SKILL_DIR/scripts/feishu_sheet.js setup
```
自动检查凭据 → 功能测试 → 缺权限时自动申请 + 输出指引。

### 浏览器自动开通权限（缺权限时用）
当 `setup` 检测到权限不足时，用浏览器自动到飞书开放平台开通：

```bash
# 获取操作指令
node SKILL_DIR/scripts/setup-perms.js --app-id <app_id>
```

**Agent 浏览器自动化步骤：**
1. 打开 `https://open.feishu.cn/app/{appId}/permission/scope/manage`
2. 如果需要登录 → 提示用户扫码，等待跳转
3. 搜索 `sheets:spreadsheet` → 对每个结果点"开通"按钮
4. 搜索 `drive:file` → 同上
5. 搜索 `docs:permission` → 同上
6. 提示用户点"创建版本并发布"
7. 运行 `node feishu_sheet.js apply-perms` 发送审批请求

### 手动开通
1. 打开 `https://open.feishu.cn/app/{appId}/permission/scope/manage`
2. 搜索 `sheets:spreadsheet` → 全部开通
3. 搜索 `drive:file` → 全部开通
4. 搜索 `docs:permission` → 全部开通
5. 创建版本并发布

## API 参考
详细 API 说明见 `SKILL_DIR/references/api-reference.md`
