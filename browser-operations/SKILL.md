# Browser Operations Skill

浏览器自动化操作指南，用于通过 OpenClaw 的 browser tool 控制浏览器。

## 启动浏览器

### 方式一：使用 browser tool
```
browser action=start profile=openclaw
```

### 方式二：使用 CLI 命令
```bash
openclaw browser start
```

**启动返回信息：**
- `cdpPort`: Chrome DevTools Protocol 端口
- `cdpUrl`: DevTools 调试地址
- `pid`: 浏览器进程 ID
- `userDataDir`: 用户数据目录

## Profile 选择

| Profile | 说明 | 使用场景 |
|---------|------|---------|
| `openclaw` | 独立的浏览器实例 | 推荐，隔离环境，不影响日常 Chrome |
| `chrome` | 接管你的 Chrome 浏览器 | 需要使用已登录的账号时 |

**注意：** 使用 `chrome` profile 需要先在 Chrome 浏览器中点击 OpenClaw Browser Relay 工具栏按钮。

## 常用操作

### 1. 打开网页
```
browser action=open profile=openclaw targetUrl=https://example.com
```

**返回：**
- `targetId`: 页面标识，后续操作需要用到
- `url`: 实际打开的 URL
- `title`: 页面标题

### 2. 获取页面结构 (snapshot)
```
browser action=snapshot profile=openclaw targetId=<targetId>
```

**用途：** 获取页面 DOM 结构，返回元素的 ref 引用，用于后续自动化操作。

**返回示例：**
```
- button [ref=e123] [cursor=pointer]: "提交"
- textbox [ref=e124]: "输入内容"
- generic [ref=e125]: "文本内容"
```

### 3. 截图 (screenshot)
```
browser action=screenshot profile=openclaw targetId=<targetId>
```

**用途：** 获取页面截图，用于视觉确认或调试。

### 4. 执行操作 (act)
```
browser action=act profile=openclaw targetId=<targetId> request={"kind":"click","ref":"e123"}
```

**操作类型 (kind)：**
- `click` - 点击元素
- `type` - 输入文本
- `press` - 按键
- `hover` - 悬停
- `select` - 下拉选择
- `scroll` - 滚动

**示例：**
```json
// 点击
{"kind":"click","ref":"e123"}

// 输入文本
{"kind":"type","ref":"e124","text":"Hello World"}

// 按键（如 Enter）
{"kind":"press","key":"Enter"}

// 滚动
{"kind":"scroll","direction":"down"}
```

### 5. 查看标签页 (tabs)
```
browser action=tabs profile=openclaw
```

**用途：** 查看当前打开的所有标签页，获取 targetId。

**重要：** `targetId` 在浏览器重启后会变化，每次操作前建议用 tabs 确认。

### 6. 导航 (navigate)
```
browser action=navigate profile=openclaw targetId=<targetId> targetUrl=https://example.com
```

**用途：** 在当前标签页跳转到新 URL。

### 7. 关闭标签页 (close)
```
browser action=close profile=openclaw targetId=<targetId>
```

### 8. 停止浏览器 (stop)
```
browser action=stop profile=openclaw
```

## 典型工作流

### 飞书网页版操作流程
```
1. browser action=start profile=openclaw
2. browser action=open targetUrl=https://feishu.cn/...
3. browser action=snapshot targetId=xxx  // 获取页面元素
4. browser action=act request={"kind":"click","ref":"xxx"}  // 点击/输入
5. browser action=screenshot  // 确认结果
```

### 自动化表单填写
```
1. browser action=open targetUrl=<表单URL>
2. browser action=snapshot  // 获取输入框 ref
3. browser action=act request={"kind":"type","ref":"input1","text":"内容"}
4. browser action=act request={"kind":"click","ref":"submit"}
```

### 页面内容提取
```
1. browser action=open targetUrl=<目标URL>
2. browser action=snapshot  // 获取页面结构
3. 从 snapshot 中提取需要的信息
```

## 注意事项

1. **targetId 会变化**：浏览器重启后 targetId 会重新生成，每次操作前用 `tabs` 确认
2. **先 snapshot 再 act**：自动化操作前先获取页面结构，确认元素的 ref
3. **使用 openclaw profile**：推荐使用独立浏览器实例，避免影响日常 Chrome
4. **截图确认**：重要操作后截图确认结果
5. **新任务开新 tab**：用 `open` 而不是 `navigate`，避免覆盖其他任务正在使用的页面

## 错误处理

### 页面未加载完成
- 等待几秒后重新 snapshot
- 或使用 `act` 的 `wait` 操作

### 元素未找到
- 重新 snapshot 获取最新的 ref
- 检查页面是否发生跳转

### 登录态丢失
- 使用 `chrome` profile 接管已登录的浏览器
- 或手动登录后继续操作

## 相关文档

- OpenClaw 官方文档: https://docs.openclaw.ai
- TOOLS.md 中的浏览器使用铁律
