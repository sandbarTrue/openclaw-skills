---
name: feishu-chat
description: 飞书群聊管理（创建/更新/成员管理/解散）。通过飞书开放 API 操作群聊。当需要创建群、管理群成员、修改群信息时使用此 skill。
---

# Feishu Chat - 飞书群聊管理

## 前置条件：飞书权限

使用本 skill 前，需要在飞书开放平台为你的应用申请以下权限：

<details>
<summary>📋 点击展开权限列表（10 个 scope）</summary>

- `im:chat` — 群聊基础操作
- `im:chat:create` — 创建群聊
- `im:chat:update` — 修改群名/描述
- `im:chat:readonly` — 查看群信息
- `im:chat:read` — 读取群详情
- `im:chat:delete` — 解散群聊
- `im:chat.members:read` — 查看群成员
- `im:chat.members:write_only` — 添加/移除群成员
- `im:chat.members:bot_access` — 机器人进入群聊
- `im:chat:operate_as_owner` — 以群主身份操作

</details>

**快速申请（批量导入）：**
1. 打开飞书开发者后台 → 你的应用 → **开发配置 > 权限管理**
2. 找到 **批量导入导出** 区域，切换到 **导入** 页签
3. 复制 `scopes.json` 的内容粘贴进去，点击 **申请开通**

```bash
cat SKILL_DIR/scopes.json
```

也可以通过 API 自动申请：`bash SKILL_DIR/apply-scopes.sh`

## 何时使用
- 创建飞书群聊
- 修改群名/描述/群主
- 添加/移除群成员
- 查看群信息/成员列表
- 列出机器人所在的群
- 解散群聊

## 脚本路径
```
SKILL_DIR/scripts/feishu_chat.sh
```

## 快速用法

### 创建群聊
```bash
bash SKILL_DIR/scripts/feishu_chat.sh create --name "群名" --user <open_id>
```

创建群后 **bot 是群主**，需要转让群主时用 update --owner。

### 创建群并添加多人
```bash
bash SKILL_DIR/scripts/feishu_chat.sh create --name "群名" --user <id1> --user <id2> --desc "群描述"
```

### 修改群信息
```bash
# 改名
bash SKILL_DIR/scripts/feishu_chat.sh update --chat <chat_id> --name "新群名"

# 转让群主
bash SKILL_DIR/scripts/feishu_chat.sh update --chat <chat_id> --owner <open_id>

# 改描述
bash SKILL_DIR/scripts/feishu_chat.sh update --chat <chat_id> --desc "新描述"
```

### 查看群信息
```bash
bash SKILL_DIR/scripts/feishu_chat.sh info --chat <chat_id>
```

### 查看群成员
```bash
bash SKILL_DIR/scripts/feishu_chat.sh members --chat <chat_id>
```

### 添加群成员
```bash
bash SKILL_DIR/scripts/feishu_chat.sh add --chat <chat_id> --user <open_id>
bash SKILL_DIR/scripts/feishu_chat.sh add --chat <chat_id> --user <id1> --user <id2>
```

### 移除群成员
```bash
bash SKILL_DIR/scripts/feishu_chat.sh remove --chat <chat_id> --user <open_id>
```

### 列出机器人所在的群
```bash
bash SKILL_DIR/scripts/feishu_chat.sh list
bash SKILL_DIR/scripts/feishu_chat.sh list --page_size 50
```

### 解散群聊
```bash
bash SKILL_DIR/scripts/feishu_chat.sh disband --chat <chat_id>
```

## ⚠️ 注意事项

### open_id 跨应用问题
飞书的 open_id 是 **每个应用独立的**，不同 app 的 open_id 不能混用。
- 当前 app（cli_a3107947517f500e）下的用户 open_id 来自飞书消息的 `from` 字段
- 旧 app（cli_a9f77611ef785cd2）的 open_id 不能用于当前 app 的 API

### 群主
- 创建群后 bot 自动成为群主
- 如需转让群主，用 `update --owner <open_id>`
- bot 必须是群主才能执行部分管理操作（如解散群）

### 权限要求
- `im:chat` - 创建/更新群聊
- `im:chat.members:read` - 查看群成员
- `im:chat:readonly` - 查看群信息

## 已知用户 open_id（当前 app: cli_a3107947517f500e）

| 用户 | open_id |
|------|---------|
| 周军 (zhoujun.sandbar) | ou_a9c16b75a237982f33707428447e68ba |

## 已创建群列表

| 群名 | chat_id | 创建时间 |
|------|---------|---------|
| 【Kola】每日工作 | oc_a458de5debcdb0f0bb5ba01778c67718 | 2026-02-26 |

## 技术细节
- 使用 tenant_access_token 认证
- 凭据自动从 `~/.openclaw/openclaw.json` 的 `channels.feishu` 读取
- 纯 bash + curl 实现，无额外依赖
