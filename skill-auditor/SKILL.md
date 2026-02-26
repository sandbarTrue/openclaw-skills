---
name: skill-auditor
description: 审查 ClawHub/外部 Skills 的安全性。安装任何外部 skill 前必须先用此 skill 审查。当需要安装、评估、审核外部 skill 时使用。
---

# Skill Auditor — 外部 Skill 安全审查

**铁律：任何外部 skill，先审后装，不审不装。**

## 审查流程

### Step 1: 下载源码（不安装）

```bash
# 方法 A: clawhub 下载到临时目录
mkdir -p /tmp/skill-audit && cd /tmp/skill-audit
clawhub install <skill-name> --dir .

# 方法 B: 直接下载 zip
curl -sL -o <name>.zip "https://wry-manatee-359.convex.site/api/v1/download?slug=<name>"
unzip -o <name>.zip -d <name>/
```

### Step 2: 自动扫描

```bash
bash /root/.openclaw/workspace/skills/skill-auditor/scripts/audit.sh /tmp/skill-audit/<skill-name>
```

### Step 3: 人工复核

扫描报告会标注风险等级。**RED = 禁止安装，YELLOW = 需人工确认，GREEN = 可安装。**

对于 YELLOW 项，逐条阅读相关代码确认意图。

### Step 4: 安装决策

| 结果 | 动作 |
|------|------|
| 全 GREEN | 可以安装：`clawhub install <name>` |
| 有 YELLOW | 报告给the user，等确认 |
| 有 RED | **禁止安装**，通知the user |

### Step 5: 记录审查结果

每次审查结果记录到 `memory/skill-audits.md`：

```markdown
## <skill-name> v<version> — <日期>
- **结论**: ✅ 安全 / ⚠️ 有风险 / ❌ 危险
- **风险项**: （列出所有非 GREEN 项）
- **说明**: （简要说明）
```

## 审查检查项（7 大类）

### 1. 🔴 网络外联（最高风险）
- curl/wget/fetch 到外部 URL
- 反向 shell、数据上传
- 连接未知 API 端点

### 2. 🔴 凭证/密钥访问
- 读取 ~/.ssh/、~/.aws/、环境变量中的 key/token
- 读取 openclaw.json 配置
- 读取 .env 文件

### 3. 🟡 文件系统写入
- 写入 skill 自身目录之外的文件
- 修改 AGENTS.md / SOUL.md / TOOLS.md（合理但需确认）
- 写入系统目录 /etc/, /usr/

### 4. 🟡 代码执行
- shell 脚本的 eval、exec、source
- Node.js 的 child_process、exec、spawn
- 动态 require/import

### 5. 🟡 Hook 行为
- hook 读取/修改 agent bootstrap 内容
- hook 注入 prompt 内容
- hook 的触发事件范围

### 6. 🟢 纯文本指导
- SKILL.md 只包含文本说明和表格
- 无脚本、无 hook、无可执行文件
- references/ 目录只有文档

### 7. 🟢 元数据一致性
- _meta.json 信息合理
- 版本号正常
- 作者有 GitHub 可追溯
