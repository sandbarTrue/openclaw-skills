---
name: openspec-bg
description: 通过OpenSpec + Claude Code在后台执行编码任务。支持GLM-5等模型，用screen管理持久化会话。当需要大量编码修改时使用此skill代替Opus直接编码，节省token。
---

# OpenSpec Background Runner Skill

## 何时使用
- 大型编码任务（>50行代码修改）
- 需要多文件修改的feature开发
- Bug修复、重构等编程任务
- 需要节省Opus token时（GLM-5免费）
- 不需要 openspec 结构的快速编码任务（用 `run-direct`）

## 两种模式

### 模式1：OpenSpec Change（结构化大项目）
需要 openspec change 目录结构（proposal.md + tasks.md + specs/），适合多任务、多迭代的大型项目。

```bash
bash SKILL_DIR/scripts/run.sh start --project /path/to/project --change change-name [--model glm-5]
```

### 模式2：Run-Direct（快速单任务）
不需要 openspec 结构，直接给一个任务描述让 Claude Code 执行。适合 bug 修复、小功能、文件修改等。

```bash
# 短任务直接 -t 传递
bash SKILL_DIR/scripts/run.sh run-direct --project /path/to/project --task "任务描述" [--model glm-5]

# 长任务/含特殊字符的任务：先写到文件，用 -f 传递（推荐）
bash SKILL_DIR/scripts/run.sh run-direct --project /path/to/project --task-file /tmp/task.md [--model glm-5]
```

**⚠️ 推荐用 `--task-file`（`-f`）传递复杂任务**：直接 `-t` 传递含反引号、括号、代码块的长文本可能被 shell 解析出错。

## 前提条件
- Claude Code CLI 已安装（`claude --version`）
- 模型已配置：`~/.openspec-config` 存在且有 API key
- Node.js 可用（`/root/.nvm/versions/node/v24.10.0/bin`）

## 快速用法

### 启动 OpenSpec 任务
```bash
bash SKILL_DIR/scripts/run.sh start --project /path/to/project --change change-name [--model glm-5] [--max-duration 2h]
```

### 启动快速编码任务
```bash
bash SKILL_DIR/scripts/run.sh run-direct -p /path/to/project -t "修复登录页面的按钮样式" -m glm-5
```

### 查看状态
```bash
bash SKILL_DIR/scripts/run.sh status
```

### 查看日志
```bash
bash SKILL_DIR/scripts/run.sh logs [session-name] [--lines 200]
```

### 停止任务
```bash
bash SKILL_DIR/scripts/run.sh stop [session-name]
```

### 停止所有
```bash
bash SKILL_DIR/scripts/run.sh stop-all
```

### 查看可用模型
```bash
bash SKILL_DIR/scripts/run.sh list-models
```

## Claude Code + GLM-5 集成说明

### 已打通的链路
1. **OpenClaw 子 agent → GLM-5**：通过 `zhipu/glm-5` provider，openai-completions API
2. **Claude Code `-p` 模式 → GLM-5**：通过智谱 Anthropic 兼容 API
3. **openspec-bg screen 会话 → Claude Code → GLM-5**：本 skill 的核心模式

### 关键配置
- **GLM-5 OpenClaw 配置**：`reasoning: false`（必须！见下方「已知问题」）
- **智谱 API 端点**：`https://open.bigmodel.cn/api/anthropic`
- **API Key**：在 `~/.openspec-config` 中配置
- **模型 ID**：`glm-5`（不是 `glm-4.7`，这是两个不同的模型）

## 已知问题与修复

### 1. 字节内网代理干扰（已修复）
**现象**：Claude Code `-p` 模式连接智谱 API 时永远卡住，无响应。
**根因**：服务器环境有字节内网代理 `http_proxy=http://sys-proxy-rd-relay.byted.org:8118`，Claude Code 通过此代理连智谱 → 代理不可达 → 卡死。
**修复**：run.sh 的 SCREEN_CMD 里已加入 `unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY`。

### 2. OpenClaw reasoning=true 导致 400 错误（已修复）
**现象**：OpenClaw 子 agent 用 GLM-5 时报 `400 角色信息不正确`。
**根因**：`reasoning: true` 让 OpenClaw 发 `"role": "developer"` 的 system prompt，智谱 API 不认识此 role。
**修复**：GLM-5 配置改为 `reasoning: false`。这不影响 GLM-5 自身的思考能力（reasoning_content 是模型内部行为）。

### 3. Root 用户不能用 --dangerously-skip-permissions（但普通用户可以）
**现象**：`claude -p --dangerously-skip-permissions` 在 **root** 下报错退出。
**修复**：run.sh 检测 root 用户时自动用 `su -l zhoujun.sandbar` 切换执行。
**重要**：`zhoujun.sandbar` 等普通用户 **可以** 用 `--dangerously-skip-permissions`！之前误以为普通用户也不能用，导致写文件时 permission_denials。
**runner 已修复**：自动加 `--dangerously-skip-permissions`（非 root 时）。

### 4. su -l 清掉环境变量导致认证失败（已修复 x2）
**现象**：`su -l zhoujun.sandbar` 是 login shell，会清掉所有环境变量，导致 Claude Code 报 `Not logged in` 或 `401 Unauthorized`。
**根因**：`ANTHROPIC_API_KEY` 和 `ANTHROPIC_BASE_URL` 在 su -l 后丢失。
**修复**：**必须用临时脚本方案**（bake env vars）。不要在 `su -c '...'` 里嵌套引号传变量。
```bash
TMPRUN="/tmp/openspec-run-$$.sh"
cat > "$TMPRUN" << 'EOF'
#!/bin/bash
export PATH=/root/.nvm/versions/node/v24.10.0/bin:$PATH
unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY
EOF
echo "export ANTHROPIC_BASE_URL='$ANTHROPIC_BASE_URL'" >> "$TMPRUN"
echo "export ANTHROPIC_API_KEY='$ANTHROPIC_API_KEY'" >> "$TMPRUN"
echo "unset ANTHROPIC_AUTH_TOKEN CLAUDE_CODE_OAUTH_TOKEN" >> "$TMPRUN"
echo "cd '/path/to/project'" >> "$TMPRUN"
echo "exec bash /path/to/runner.sh" >> "$TMPRUN"
chmod +x "$TMPRUN"
su -l zhoujun.sandbar -c "bash $TMPRUN"
rm -f "$TMPRUN"
```
**⚠️ 此问题已复现三次**（run-direct / start 旧版 / start SCREEN_CMD 嵌套 heredoc）。
**根因总结**：SCREEN_CMD 双引号字符串里不能嵌套 heredoc，env vars 会在展开时丢失。
**最终方案**：在启动 screen **之前**生成脚本文件（`${LOG_DIR}/${SESSION}-run.sh`），screen 只执行 `bash script.sh`。

### 4.1 Runner 必须传 --model 和 --dangerously-skip-permissions
**现象**：Runner 的 `claude -p` 没有 `--model` 参数，Claude Code 默认用 `claude-sonnet`（走 Anthropic API），不是 GLM-5。花了 $1.24 Sonnet 费用。
**修复**：Runner 通过 `OPENSPEC_MODEL` 环境变量读取模型名，自动加 `--model $OPENSPEC_MODEL`。run.sh 在临时脚本里 export 此变量。
**同时**：Runner 自动为非 root 用户加 `--dangerously-skip-permissions`，避免写文件时的 permission_denials。

### 5. ANTHROPIC_AUTH_TOKEN 冲突（已修复）
**现象**：环境中有旧的 `ANTHROPIC_AUTH_TOKEN=sk-5L2y...`（stale key），即使设了正确的 `ANTHROPIC_API_KEY`，Claude Code 优先读 `ANTHROPIC_AUTH_TOKEN` 导致 401。
**修复**：临时脚本中显式 `unset ANTHROPIC_AUTH_TOKEN CLAUDE_CODE_OAUTH_TOKEN`。

## 参数详解

### start 参数
| 参数 | 必填 | 说明 |
|------|------|------|
| `--project <path>` | ✅ | 项目根目录 |
| `--change <name>` | ✅ | change ID |
| `--model <id>` | ❌ | 模型 ID，默认从配置读取 |
| `--max-runs <n>` | ❌ | 最多完成n个任务后停止 |
| `--max-duration <dur>` | ❌ | 最大运行时间 |
| `--verbose` | ❌ | 详细日志 |

### run-direct 参数
| 参数 | 必填 | 说明 |
|------|------|------|
| `--project, -p <path>` | ✅ | 项目根目录 |
| `--task, -t <desc>` | ✅ | 任务描述 |
| `--model, -m <id>` | ❌ | 模型 ID，默认 glm-5 |

## 注意事项
- ⚠️ 大任务拆分成小的 tasks.md 条目（每个任务<50行代码改动）
- ⚠️ 任务完成后一定要检查编译是否通过
- ⚠️ screen 会话在服务器重启后会丢失，注意及时检查
- ⚠️ 同时跑多个 Claude Code 进程可能导致超时，建议一个一个来
- ⚠️ **su -l 必须用临时脚本传 env vars**（见「已知问题 #4」），直接 su -c 传变量会丢失
- ⚠️ **新增 su -l 代码路径时必须检查认证**，此 bug 已复现两次
- ✅ 多个任务可以并行运行（不同change、不同项目）
- ✅ 输出格式为 key=value，便于程序解析
- ✅ 日志保存在 /tmp/openspec-bg-logs/，session状态在 ~/.openspec-state/
- ✅ GLM-5 免费使用（智谱 Coding Pro 订阅）

## 底层架构
```
run.sh (this skill)
  ├─ start (OpenSpec模式)
  │    └─ sources openspec-config.sh export <model>
  │    └─ screen -dmS <session>
  │         └─ unset proxy
  │         └─ [su -l zhoujun.sandbar if root]
  │         └─ openspec-runner.sh --change <id>
  │              └─ claude -p <prompt> → GLM-5 API
  │
  └─ run-direct (快速模式)
       └─ sources openspec-config.sh export <model>
       └─ screen -dmS <session>
            └─ unset proxy
            └─ [su -l zhoujun.sandbar if root]
            └─ claude -p "任务描述" → GLM-5 API
```
