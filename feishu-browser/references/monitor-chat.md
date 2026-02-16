# 群消息监控

## 概述

通过定期截图和 snapshot 检测群聊中的新消息，判断是否需要回复。

## 监控流程

### 1. 进入目标群聊

```
browser action=navigate profile=openclaw targetUrl="https://ja484frx8z.feishu.cn/next/messenger/"
```

等待加载后点击目标群聊。

### 2. 获取当前消息列表

```javascript
// ⚠️ 待验证 - 提取消息列表（发送者+内容）
(function(){
  var container = document.querySelector('[class*="message-list"], [class*="msg-list"]');
  if(!container) return 'container not found';
  var items = container.querySelectorAll('[class*="message-item"], [class*="msg-item"]');
  var msgs = [];
  items.forEach(function(item){
    var text = item.textContent.trim();
    if(text) msgs.push(text);
  });
  return JSON.stringify(msgs.slice(-20));
})()
```

也可以直接用 snapshot 获取 aria tree 解析消息。

### 3. 对比检测新消息

用状态文件记录上次看到的最后一条消息：

**状态文件：** `/root/.openclaw/workspace/memory/feishu-chat-state.json`

```json
{
  "lastChecked": "2024-01-01T12:00:00Z",
  "lastMessagePreview": "张三: 好的收到",
  "chatName": "项目群"
}
```

每次检查时：
1. snapshot 获取当前消息
2. 与状态文件中的 lastMessagePreview 对比
3. 如果不同，说明有新消息
4. 处理完后更新状态文件

### 4. 判断是否需要回复

**必须回复：**
- 消息中 @瓦力 / @Wall-E / 包含「瓦力」
- 直接提问且明确指向瓦力

**可以参与：**
- 讨论的话题瓦力有相关信息可以补充
- 有人提出问题且没人回答
- 技术讨论中可以提供帮助

**不回复：**
- 纯闲聊
- 已有人回答的问题
- 与瓦力无关的话题

### 5. 监控循环（通过 cron 或 heartbeat）

建议在 HEARTBEAT.md 中添加检查项，而非自己实现循环：

```markdown
## 飞书群消息检查
- 打开飞书消息页
- 检查目标群聊是否有新消息
- 如有 @瓦力 的消息，立即回复
```

或通过 cron job 每隔一段时间执行检查。

## 实现方案：Screenshot 对比

更可靠的检测方式是截图对比：

```
# 截图当前聊天窗口
browser action=screenshot profile=openclaw

# 用 image tool 分析截图中的新消息
image prompt="列出这个飞书聊天窗口中最新的5条消息，格式：发送者: 内容" image=<screenshot_path>
```

这种方式不依赖 DOM 结构，更稳定。

## 注意事项

- 飞书页面长时间不操作可能会断连，需要刷新
- 监控间隔建议 10-30 秒，太频繁可能触发限制
- 保持浏览器标签页在前台，否则页面可能不更新
