---
name: feishu-setup
description: 飞书开放平台对接指南。OpenClaw 连接飞书所需的应用创建和基础配置。新用户部署时参考此文档完成飞书对接。
---

# 飞书开放平台对接指南

OpenClaw 通过飞书自建应用（机器人）与飞书对接。本文档帮你完成基础对接，各 Skill 所需的具体权限在各自的 SKILL.md 中说明。

## 第一步：创建飞书自建应用

1. 打开 [飞书开放平台](https://open.feishu.cn/app)
2. 点击 **创建企业自建应用**
3. 填写应用名称（如"瓦力"或"OpenClaw Bot"）
4. 记录 **App ID** 和 **App Secret**

## 第二步：启用机器人能力

1. 进入应用 → **添加应用能力** → 勾选 **机器人**
2. 进入 **事件订阅** → 设置请求地址
3. 添加事件：`im.message.receive_v1`（接收消息，**必需**）

## 第三步：申请基础权限

以下 5 个权限是 OpenClaw 消息收发的**最低要求**，必须申请：

| 权限 scope | 说明 |
|------------|------|
| `im:message:send_as_bot` | 以机器人身份发送消息 |
| `im:message:readonly` | 读取消息内容 |
| `im:message.group_at_msg:readonly` | 读取群内 @机器人 的消息 |
| `im:resource` | 上传/下载文件和图片 |
| `contact:user.id:readonly` | 获取用户 ID |

申请完这 5 个，OpenClaw 就能收发消息了。

### 按需申请更多权限（批量导入 JSON）

飞书开发者后台支持 **JSON 批量导入权限**，无需逐个搜索勾选：

1. 打开 [开发者后台](https://open.feishu.cn/app) → 你的应用 → **开发配置 > 权限管理**
2. 找到 **批量导入导出** 区域，切换到 **导入** 页签
3. 复制对应 skill 的 `scopes.json` 粘贴进去
4. 点击 **申请开通** → 系统自动过滤已有权限，只申请缺失的

每个飞书 Skill 都自带 `scopes.json`，**复制粘贴一步搞定**：

| Skill | 功能 | 权限数 | 批量导入 |
|-------|------|--------|---------|
| **lark-manager** | 文档创建/编辑/权限 | 35 个 | 复制 `lark-manager/scopes.json` |
| **feishu-chat** | 群聊管理 | 10 个 | 复制 `feishu-chat/scopes.json` |
| **feishu-browser** | 浏览器模拟操作 | **0 个** | 无需申请（不走 API） |

### 想一次性全部申请？

复制 `feishu-setup/scopes.json`（87 个权限）粘贴到批量导入，或运行：
```bash
bash feishu-setup/apply-scopes.sh
```

## 第四步：配置 OpenClaw

在 `openclaw.json` 中配置飞书 channel：

```jsonc
{
  "channels": {
    "feishu": {
      "appId": "cli_xxxxxxxxxx",        // App ID
      "appSecret": "xxxxxxxxxx",         // App Secret
      "encryptKey": "xxxxxxxxxx",        // 事件订阅 → Encrypt Key
      "verificationToken": "xxxxxxxxxx"  // 事件订阅 → Verification Token
    }
  }
}
```

## 第五步：发布应用

1. 进入应用 → **版本管理与发布** → 创建版本
2. 提交审核 → 管理员审批
3. 在飞书工作台搜索应用名，添加到常用

## 常见问题

**Q: 个人版飞书能用吗？**
A: 可以，个人版也能创建自建应用。

**Q: open_id 是什么？**
A: 用户在每个应用内的唯一 ID（`ou_xxx`），不同应用不能互用。从消息的 `from` 字段获取。

**Q: feishu-browser 不需要权限？**
A: 对，它通过浏览器模拟真人操作，不走 API。需要手动登录一次飞书网页版。
