---
name: lark-manager
description: 飞书文档API操作（创建/读取/编辑/权限管理）。当需要通过API创建飞书文档、写入内容、设置权限时使用此skill。优先于OpenClaw内置feishu_doc工具，支持长文档分批写入。
---

# Lark Manager - 飞书文档API操作

## 前置条件：飞书权限

使用本 skill 前，需要在飞书开放平台为你的应用申请以下权限：

<details>
<summary>📋 点击展开权限列表（35 个 scope）</summary>

**文档操作（必需）：**
- `docx:document` — 文档基础操作
- `docx:document:readonly` — 读取文档
- `docx:document:write_only` — 写入文档
- `docx:document:create` — 创建新文档
- `docs:document.content:read` — 读取文档内容
- `docs:document.media:upload` — 上传图片到文档
- `docs:document.media:download` — 下载文档中的图片
- `docs:document:export` — 导出文档
- `docs:document:import` — 导入文档
- `docs:document:copy` — 复制文档
- `docs:document.comment:create` — 创建评论
- `docs:document.comment:read` — 读取评论

**权限管理（用 add-permission / transfer-owner 时需要）：**
- `docs:permission.member` — 权限基础操作
- `docs:permission.member:create` — 添加协作者
- `docs:permission.member:delete` — 移除协作者
- `docs:permission.member:update` — 修改协作者权限
- `docs:permission.member:transfer` — 转移文档所有权
- `docs:permission.member:readonly` — 查看协作者列表
- `docs:permission.member:retrieve` — 获取协作者详情
- `docs:permission.member:auth` — 权限认证
- `docs:permission.setting` — 权限设置
- `docs:permission.setting:readonly` — 查看权限设置
- `docs:permission.setting:read` — 读取权限设置
- `docs:permission.setting:write_only` — 修改权限设置

**云盘（创建文档到指定文件夹时需要）：**
- `drive:file` — 文件基础操作
- `drive:file:readonly` — 读取文件信息
- `drive:file:upload` — 上传文件
- `drive:file:download` — 下载文件
- `drive:drive` — 云盘基础操作
- `drive:drive:readonly` — 查看云盘
- `space:folder:create` — 创建文件夹
- `space:document:retrieve` — 获取文档信息
- `space:document:move` — 移动文档
- `space:document:delete` — 删除文档

</details>

**快速申请（批量导入）：**
1. 打开飞书开发者后台 → 你的应用 → **开发配置 > 权限管理**
2. 找到 **批量导入导出** 区域，切换到 **导入** 页签
3. 复制 `scopes.json` 的内容粘贴进去，点击 **申请开通**

```bash
# 复制 JSON 到剪贴板（macOS）
cat SKILL_DIR/scopes.json | pbcopy
# 或者直接查看内容
cat SKILL_DIR/scopes.json
```

也可以通过 API 自动申请：`bash SKILL_DIR/apply-scopes.sh`

## 何时使用
- 创建飞书文档
- 写入/编辑飞书文档内容（支持长文档，自动分批）
- 读取飞书文档内容并导出markdown
- 管理文档权限（添加/修改/删除/列出协作者）
- **优先于 `feishu_doc` 工具**（内置工具长内容会400报错）

## 脚本路径
```
SKILL_DIR/scripts/lark_manager.js
```

## 快速用法

### 创建文档（从markdown文件）
```bash
node SKILL_DIR/scripts/lark_manager.js create --title "文档标题" --file content.md
```

### 创建文档并自动授权
```bash
node SKILL_DIR/scripts/lark_manager.js create --title "文档标题" --file content.md --user YOUR_OPEN_ID
```

### 读取文档
```bash
node SKILL_DIR/scripts/lark_manager.js read --doc <doc_id>
# 导出为markdown
node SKILL_DIR/scripts/lark_manager.js read --doc <doc_id> --output export.md
```

### 编辑文档（替换全部内容）
```bash
node SKILL_DIR/scripts/lark_manager.js edit --doc <doc_id> --file new_content.md
```

### 编辑单个block
```bash
node SKILL_DIR/scripts/lark_manager.js edit --doc <doc_id> --block <block_id> --text "新内容"
```

### 转移文档所有者
```bash
# 转移给the user（默认，不需要指定 --user）
node SKILL_DIR/scripts/lark_manager.js transfer-owner --doc <doc_id>
# 转移给指定用户
node SKILL_DIR/scripts/lark_manager.js transfer-owner --doc <doc_id> --user ou_xxx
```

### 添加权限
```bash
# edit / view / full_access
node SKILL_DIR/scripts/lark_manager.js add-permission --doc <doc_id> --user ou_xxx --perm edit
```

### 列出权限
```bash
node SKILL_DIR/scripts/lark_manager.js list-permissions --doc <doc_id>
```

### 测试连接
```bash
node SKILL_DIR/scripts/lark_manager.js test
```

## 工作流程

### 创建完整文档
1. 将内容写成 markdown 文件（`/root/.openclaw/workspace/xxx.md`）
2. 用 `create --title --file` 创建文档
3. 用 `add-permission` 给相关人员开权限
4. 获取文档URL分享给用户

### 关键参数
- `--doc, -d`: 文档ID（从URL提取：`/docx/XXX` 中的 XXX）
- `--user, -u`: 用户open_id（格式：`ou_xxxx`）
- `--perm, -p`: 权限级别（view / edit / full_access）
- `--file, -f`: markdown文件路径
- `--folder`: 目标文件夹token

## 默认行为
- **所有新建文档自动转移 owner 给the user**（即使不指定 `--user`）
- 转移流程：创建 → 添加 full_access → transfer_owner
- 如果 transfer 失败，自动 fallback 到 full_access 权限

## 凭据配置
脚本自动从 OpenClaw 配置读取飞书凭据（`~/.openclaw/openclaw.json` → `channels.feishu.appId/appSecret`），无需额外配置。也支持环境变量 `FEISHU_APP_ID` / `FEISHU_APP_SECRET` 覆盖。

## 技术细节
- 自动分批写入（chunkSize=50 blocks），解决长文档400错误
- 支持 markdown → 飞书blocks 转换（标题/列表/代码/引用/分割线/待办/表格/图片）
- 图片插入：3步法（创建空image block → 上传图片 → PATCH replace_image）
- 表格插入：使用 descendant API（block_type=31/32）
- 使用 tenant_access_token 认证，自动从 openclaw.json 读取 appId/appSecret
