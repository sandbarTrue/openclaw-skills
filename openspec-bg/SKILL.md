---
name: openspec-bg
description: 通过OpenSpec + Claude Code在后台执行编码任务。支持GLM-5等模型，用screen管理持久化会话。当需要大量编码修改时使用此skill代替Opus直接编码，节省token。
---

# OpenSpec Background Runner Skill

## 何时使用
- 大型编码任务（>50行代码修改）
- 需要多文件修改的feature开发
- Bug修复、重构等编程任务
- 需要节省Opus token时（GLM-5比Opus便宜得多）

## 前提条件
- 项目已初始化openspec：`cd /path/to/project && openspec init --tools claude`
- 已创建change：`openspec new change "change-name"`
- change目录下有 **tasks.md**（必须）和 spec 文件
- 模型已配置：`~/.openspec-config` 存在且有 API key

## 快速用法

### 启动任务
```bash
bash SKILL_DIR/scripts/run.sh start --project /path/to/project --change change-name [--model glm-5] [--max-duration 2h]
```
输出 key=value 格式：`SESSION=openspec-xxx LOG=/tmp/... STATUS=started`

### 查看状态
```bash
bash SKILL_DIR/scripts/run.sh status
```
输出：`STATUS=active` 或 `STATUS=no_sessions`，以及每个会话的详情。

### 查看日志
```bash
bash SKILL_DIR/scripts/run.sh logs [session-name] [--lines 200]
```
日志内容在 `---LOG_START---` 和 `---LOG_END---` 之间。

### 停止任务
```bash
bash SKILL_DIR/scripts/run.sh stop [session-name]
```
不指定session时停止最近的那个。

### 停止所有
```bash
bash SKILL_DIR/scripts/run.sh stop-all
```

### 查看可用模型
```bash
bash SKILL_DIR/scripts/run.sh list-models
```

## 工作流程
1. 在项目目录创建 openspec change（写好 spec.md + tasks.md）
2. 用本skill启动后台执行
3. 定期检查状态和日志（建议每10-15分钟检查一次）
4. 完成后验证：`cd /path/to/project && npx next build`（如果是Next.js项目）
5. 提交推送：`git push`

## 模型配置
当前配置的模型在 `~/.openspec-config`：
- **glm-5**: 智谱GLM-5（默认，便宜，适合大批量任务）

添加新模型（交互式，需要TTY）：
```bash
bash /root/ai_magic/openspec-bg/openspec-bg.sh add-model
```

或直接编辑 `~/.openspec-config` 添加。

## Start 参数详解

| 参数 | 必填 | 说明 |
|------|------|------|
| `--project <path>` | ✅ | 项目根目录（包含 openspec/ 的目录） |
| `--change <name>` | ✅ | change ID（openspec/changes/ 下的目录名） |
| `--model <id>` | ❌ | 模型 ID，默认从配置读取 |
| `--max-runs <n>` | ❌ | 最多完成n个任务后停止 |
| `--max-duration <dur>` | ❌ | 最大运行时间，如 `2h`, `30m` |
| `--verbose` | ❌ | 显示详细日志（含prompt） |

## 注意事项
- ⚠️ 大任务拆分成小的 tasks.md 条目（每个任务<50行代码改动）
- ⚠️ GLM-5 的 max_tokens 限制较低，超复杂任务可能超时
- ⚠️ 任务完成后一定要检查编译是否通过
- ⚠️ screen 会话在服务器重启后会丢失，注意及时检查
- ✅ 多个任务可以并行运行（不同change、不同项目）
- ✅ 输出格式为 key=value，便于程序解析
- ✅ 日志保存在 /tmp/openspec-bg-logs/，session状态在 ~/.openspec-state/

## 底层架构
```
run.sh (this skill)
  └─ sources openspec-config.sh export <model>   # 设置 ANTHROPIC_* 环境变量
  └─ screen -dmS <session> bash -c ...
       └─ openspec-runner.sh --change <id>        # 核心runner: 解析tasks.md → 调用claude -p → 标记完成 → 循环
            └─ claude -p <prompt>                  # Claude Code CLI
```
