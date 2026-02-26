---
name: task-manager
description: 新增/更新任务到 task-queue.json 并同步看板。当需要创建新任务、更新任务状态、或同步看板数据时使用此 skill。
---

# Task Manager Skill

## 何时使用
- the user提出新需求/任务
- 需要更新任务状态（PROPOSED → REGISTERED → EXECUTING 等）
- 需要同步看板数据
- 需要批量操作任务

## 核心文件
- **数据源**: `/root/.openclaw/workspace/task-queue.json`（version 2，单一数据源）
- **Collector**: `/root/.openclaw/workspace/stats-collector.js`
- **看板**: `https://junaitools.com/dashboard/tasks/index.html`
- **TASK.md**: `/root/.openclaw/workspace/TASK.md`（人类可读备份，同步更新）

## 新增任务（必须遵循）

### 步骤 1: 添加到 task-queue.json

使用 `SKILL_DIR/scripts/add-task.sh` 或手动添加。**所有字段必须完整**：

```bash
bash SKILL_DIR/scripts/add-task.sh \
  --id "task-name-MMDD" \
  --name "任务标题" \
  --priority 50 \
  --source "the user MM-DD" \
  --description "任务描述" \
  --type "feature|bugfix|research|refactor|infra" \
  --deploy \
  --depends "other-task-id"
```

### 步骤 2: 同步到 TASK.md

```bash
bash SKILL_DIR/scripts/sync-taskmd.sh
```

### 步骤 3: 刷新看板

```bash
bash SKILL_DIR/scripts/refresh-dashboard.sh
```

## 任务数据结构（铁律，缺字段=看板显示异常）

```json
{
  "id": "task-name-MMDD",          // ⚠️ 必须有！collector 用 id 不是 task_id
  "task_id": "task-name-MMDD",     // 同上，兼容旧代码
  "name": "任务标题",               // 看板显示
  "priority": 50,                   // P100=最高, P10=最低
  "state": "PROPOSED",              // 状态机初始值
  "type": "feature",                // feature|bugfix|research|refactor|infra
  "source": "the user 02-20",       // 来源
  "needs_deploy": true,             // 是否需要部署
  "deploy_targets": [],             // 部署目标
  "depends_on": [],                 // 依赖的其他任务 id
  "blocked_by": null,               // 阻塞原因（任务 id）
  "blocked_reason": null,           // 阻塞描述
  "proposal": null,                 // proposals/{id}.md 路径
  "description": "任务描述",
  "created_at": "ISO-8601",
  "started_at": null,
  "finished_at": null,
  "transitions": [],                // 状态转换历史
  "executions": [],                 // L2 执行记录
  "verify_report": null
}
```

## 状态机

```
PROPOSED → PENDING_PROPOSAL_REVIEW → REGISTERED → EXECUTING → AUTO_VERIFYING → MANUAL_VERIFYING → PENDING_FINAL_REVIEW → COMPLETED
                                                                                                                          ↗
BLOCKED (可从任何状态进入)                                                                                    CANCELLED
```

### 合法状态值
- `PROPOSED` — 刚创建，等待生成提案
- `PENDING_PROPOSAL_REVIEW` — 提案已生成，等the user确认
- `PENDING_APPROVAL` — 同上（兼容旧值）
- `REGISTERED` — 提案已批准，等待调度执行
- `EXECUTING` — 正在执行
- `AUTO_VERIFYING` — 自动验证中
- `MANUAL_VERIFYING` — 人工验证中（截图等）
- `PENDING_FINAL_REVIEW` — 等the user最终确认
- `COMPLETED` — 完成
- `BLOCKED` — 被阻塞
- `CANCELLED` — 已取消

## L2 执行记录结构

```json
{
  "id": "l2-1",                    // 执行记录 ID
  "name": "PRD + 技术方案",         // 描述
  "order": 1,                       // 执行顺序
  "executor": "claude-code",        // claude-code|glm5|minimax|opus|script
  "model": "glm-5",                 // 具体模型
  "state": "pending",               // pending|running|completed|failed
  "screen": null,                   // screen 会话名
  "depends_on": [],                 // 依赖的其他 L2 id
  "started_at": null,
  "finished_at": null,
  "retry_of": null,                 // 重试来源
  "retry_count": 0,
  "session_key": null,
  "cost_usd": null,
  "turns": null,
  "exit_code": null,
  "error": null,
  "verify": { "type": "manual", "checks": [] },
  "verify_result": null,
  "steps": []                       // L3 步骤（Claude Code 自行拆分）
}
```

## 常见错误（避免！）

1. ❌ 只写 `task_id` 没写 `id` → 看板显示 undefined
2. ❌ 只更新 TASK.md 没更新 task-queue.json → 看板看不到
3. ❌ 更新了 task-queue.json 没刷新看板 → 数据延迟
4. ❌ 状态值拼写错误 → 看板分类异常
5. ❌ 缺少 `created_at` → 排序异常
6. ❌ `priority` 用字符串不是数字 → 排序异常

## 刷新看板命令

```bash
# 一键刷新（collector + SCP + cache purge）
bash SKILL_DIR/scripts/refresh-dashboard.sh
```
