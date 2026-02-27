---
name: feishu-setup
description: 飞书开放平台对接指南。OpenClaw 连接飞书所需的应用创建、权限申请、配置说明。新用户部署时参考此文档完成飞书对接。
---

# 飞书开放平台对接指南

OpenClaw 通过飞书自建应用（机器人）与飞书对接。本文档列出所有飞书相关 Skills 所需的**权限**和**配置**，帮助新用户一次性申请到位。

## 第一步：创建飞书自建应用

1. 打开 [飞书开放平台](https://open.feishu.cn/app)
2. 点击 **创建企业自建应用**
3. 填写应用名称（如"瓦力"或"OpenClaw Bot"）
4. 记录 **App ID** 和 **App Secret**（后面配置要用）

## 第二步：启用机器人能力

1. 进入应用 → **添加应用能力** → 勾选 **机器人**
2. 进入 **事件订阅** → 设置请求地址（OpenClaw 会自动处理）
3. 添加以下事件：
   - `im.message.receive_v1` — 接收消息（**必需**）
   - `im.message.reaction.created_v1` — 表情回应（可选）
   - `im.chat.member.bot.added_v1` — 机器人入群通知（可选）

## 第三步：申请权限

### 🚀 快速方式：运行脚本批量申请

```bash
# 自动从 openclaw.json 读取凭据，一键提交所有权限申请
bash feishu-setup/apply-scopes.sh
```

脚本会尝试通过 API 批量提交权限申请。如果 API 不支持，会输出**控制台手动操作指南** + 直达链接。

也可以直接用 `scopes.txt`（每行一个 scope），在飞书控制台搜索框逐个粘贴勾选：
```
feishu-setup/scopes.txt    # 87 个权限，每行一个
```

> ⚠️ **一次性申请，避免后续反复找管理员审批。** 以下按功能分组，根据你要用的 Skill 选择性申请。

### 🔴 必需权限（所有飞书 Skill 都需要）

这些权限是 OpenClaw 与飞书通信的基础，**必须申请**：

| 权限 scope | 说明 | 用途 |
|------------|------|------|
| `im:message:send_as_bot` | 以机器人身份发送消息 | 回复用户消息 |
| `im:message:readonly` | 读取消息内容 | 理解用户发了什么 |
| `im:message.group_at_msg:readonly` | 读取群内 @机器人 的消息 | 群聊中被 @时响应 |
| `im:resource` | 上传/下载消息中的文件和图片 | 处理图片和文件 |
| `contact:user.id:readonly` | 获取用户 ID | 识别消息发送者 |

### 🟡 群聊管理（feishu-chat skill）

用于创建群、管理群成员、修改群信息：

| 权限 scope | 说明 |
|------------|------|
| `im:chat` | 群聊基础操作 |
| `im:chat:create` | 创建群聊 |
| `im:chat:update` | 修改群名/描述 |
| `im:chat:readonly` | 查看群信息 |
| `im:chat:read` | 读取群详情 |
| `im:chat:delete` | 解散群聊 |
| `im:chat.members:read` | 查看群成员 |
| `im:chat.members:write_only` | 添加/移除群成员 |
| `im:chat.members:bot_access` | 机器人进入群聊 |
| `im:chat:operate_as_owner` | 以群主身份操作 |

### 🟢 文档操作（lark-manager skill + OpenClaw 内置 feishu-doc）

用于创建/编辑/读取飞书文档：

| 权限 scope | 说明 |
|------------|------|
| `docx:document` | 文档基础操作 |
| `docx:document:readonly` | 读取文档 |
| `docx:document:write_only` | 写入文档 |
| `docx:document:create` | 创建新文档 |
| `docs:document.content:read` | 读取文档内容 |
| `docs:document.media:upload` | 上传图片到文档 |
| `docs:document.media:download` | 下载文档中的图片 |
| `docs:document:export` | 导出文档 |
| `docs:document:import` | 导入文档 |
| `docs:document:copy` | 复制文档 |
| `docs:document.comment:create` | 创建评论 |
| `docs:document.comment:read` | 读取评论 |

### 🔵 文档权限管理（lark-manager skill + OpenClaw 内置 feishu-perm）

用于设置文档协作者、转移文档所有权：

| 权限 scope | 说明 |
|------------|------|
| `docs:permission.member` | 权限基础操作 |
| `docs:permission.member:create` | 添加协作者 |
| `docs:permission.member:delete` | 移除协作者 |
| `docs:permission.member:update` | 修改协作者权限 |
| `docs:permission.member:transfer` | 转移文档所有权 |
| `docs:permission.member:readonly` | 查看协作者列表 |
| `docs:permission.member:retrieve` | 获取协作者详情 |
| `docs:permission.member:auth` | 权限认证 |
| `docs:permission.setting` | 权限设置 |
| `docs:permission.setting:readonly` | 查看权限设置 |
| `docs:permission.setting:write_only` | 修改权限设置 |

### 🟣 云空间/云盘（OpenClaw 内置 feishu-drive）

用于管理云盘文件和文件夹：

| 权限 scope | 说明 |
|------------|------|
| `drive:file` | 文件基础操作 |
| `drive:file:readonly` | 读取文件信息 |
| `drive:file:upload` | 上传文件 |
| `drive:file:download` | 下载文件 |
| `drive:drive` | 云盘基础操作 |
| `drive:drive:readonly` | 查看云盘 |
| `space:folder:create` | 创建文件夹 |
| `space:document:retrieve` | 获取文档信息 |
| `space:document:move` | 移动文档 |
| `space:document:delete` | 删除文档 |

### 🟤 知识库（OpenClaw 内置 feishu-wiki）

用于管理知识库空间和节点：

| 权限 scope | 说明 |
|------------|------|
| `wiki:wiki` | 知识库基础操作 |
| `wiki:wiki:readonly` | 查看知识库 |
| `wiki:space:read` | 读取空间信息 |
| `wiki:space:retrieve` | 获取空间详情 |
| `wiki:space:write_only` | 写入空间 |
| `wiki:node:read` | 读取节点 |
| `wiki:node:create` | 创建节点 |
| `wiki:node:update` | 更新节点 |
| `wiki:node:move` | 移动节点 |
| `wiki:node:copy` | 复制节点 |
| `wiki:node:retrieve` | 获取节点详情 |
| `wiki:member:create` | 添加知识库成员 |
| `wiki:member:retrieve` | 查看知识库成员 |
| `wiki:member:update` | 修改成员权限 |

### ⬜ 多维表格 / Bitable（OpenClaw 内置）

用于读写多维表格数据：

| 权限 scope | 说明 |
|------------|------|
| `bitable:app` | 多维表格基础操作 |
| `bitable:app:readonly` | 查看多维表格 |
| `base:app:read` | 读取应用信息 |
| `base:app:create` | 创建多维表格 |
| `base:record:read` | 读取记录 |
| `base:record:create` | 创建记录 |
| `base:record:update` | 更新记录 |
| `base:record:delete` | 删除记录 |
| `base:field:read` | 读取字段定义 |
| `base:table:read` | 读取表格信息 |

### 📅 日历（可选）

| 权限 scope | 说明 |
|------------|------|
| `calendar:calendar` | 日历基础操作 |
| `calendar:calendar:create` | 创建日历 |
| `calendar:calendar.event:create` | 创建日程 |
| `calendar:calendar.event:read` | 读取日程 |
| `calendar:calendar.event:update` | 更新日程 |
| `calendar:calendar.event:delete` | 删除日程 |
| `calendar:calendar.acl:create` | 共享日历 |

### 💬 消息增强（可选）

| 权限 scope | 说明 |
|------------|------|
| `im:message.group_msg` | 群发消息 |
| `im:message.p2p_msg:readonly` | 读取私聊消息 |
| `im:message:recall` | 撤回消息 |
| `im:message:update` | 更新消息 |
| `im:message.reactions:write_only` | 发送表情回应 |
| `im:message.reactions:read` | 读取表情回应 |
| `im:message.pins:write_only` | 置顶消息 |
| `im:message.pins:read` | 查看置顶消息 |

## 第四步：配置 OpenClaw

在 `openclaw.json` 中配置飞书 channel：

```jsonc
{
  "channels": {
    "feishu": {
      "appId": "cli_xxxxxxxxxx",        // 第一步拿到的 App ID
      "appSecret": "xxxxxxxxxx",         // 第一步拿到的 App Secret
      "encryptKey": "xxxxxxxxxx",        // 事件订阅 → 加密策略 → Encrypt Key
      "verificationToken": "xxxxxxxxxx"  // 事件订阅 → Verification Token
    }
  }
}
```

> 💡 `encryptKey` 和 `verificationToken` 在飞书开放平台 → 应用 → 事件订阅页面获取

## 第五步：发布应用

1. 进入应用 → **版本管理与发布**
2. 创建版本 → 提交审核
3. 管理员审批通过后，应用上线
4. 在飞书工作台搜索应用名，添加到常用

## Skill 与权限对照表（快速参考）

| Skill | 说明 | 必需权限组 |
|-------|------|-----------|
| **OpenClaw 内置** | 基础消息收发 | 🔴 必需权限 |
| **feishu-chat** | 群聊管理 | 🔴 + 🟡 |
| **lark-manager** | 文档操作 | 🔴 + 🟢 + 🔵 + 🟣 |
| **feishu-browser** | 浏览器模拟操作 | 无需 API 权限（通过浏览器操作） |
| **feishu-doc** (内置) | 文档读写 | 🔴 + 🟢 |
| **feishu-drive** (内置) | 云盘管理 | 🔴 + 🟣 |
| **feishu-wiki** (内置) | 知识库管理 | 🔴 + 🟤 |
| **feishu-perm** (内置) | 权限管理 | 🔴 + 🔵 |
| **bitable** (内置) | 多维表格 | 🔴 + ⬜ |

## 💡 建议：一次性全部申请

如果你不确定需要哪些功能，**建议一次性申请所有上述权限**。原因：
1. 每次申请都需要管理员审批，来回很耗时间
2. 权限不用不会产生费用或安全风险（只有调用 API 才会触发）
3. 后续新增 Skill 时不用再找管理员

## 常见问题

### Q: 企业管理员不给批这么多权限怎么办？
A: 先只申请 🔴 必需权限（5个），确保基础消息收发能用。其他权限用到时再逐步申请。

### Q: 个人版/免费版飞书能用吗？
A: 可以。个人版也能创建自建应用，但部分高级权限可能不可用。

### Q: feishu-browser skill 不需要权限？
A: 对。feishu-browser 是通过浏览器模拟真人操作飞书网页版，不走 API，所以不需要开放平台权限。但需要一个已登录的飞书账号。

### Q: open_id 是什么？跨应用能用吗？
A: open_id 是飞书用户在**每个应用内的唯一 ID**（格式 `ou_xxx`）。不同应用的 open_id **不能互用**。获取方式：机器人收到用户消息时，消息体的 `from` 字段里有。
