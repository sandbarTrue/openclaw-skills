#!/bin/bash
# Skill Auditor — 自动安全扫描脚本
# Usage: bash audit.sh <skill-directory>
# 输出：风险等级 + 详细发现

set -e

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BOLD='\033[1m'
NC='\033[0m'

SKILL_DIR="${1:?Usage: audit.sh <skill-directory>}"

if [ ! -d "$SKILL_DIR" ]; then
    echo -e "${RED}[ERROR]${NC} Directory not found: $SKILL_DIR"
    exit 1
fi

echo -e "${BOLD}════════════════════════════════════════${NC}"
echo -e "${BOLD}  Skill Auditor — Security Scan Report${NC}"
echo -e "${BOLD}════════════════════════════════════════${NC}"
echo ""

# Metadata
if [ -f "$SKILL_DIR/_meta.json" ]; then
    echo -e "${BOLD}📦 Metadata:${NC}"
    cat "$SKILL_DIR/_meta.json"
    echo ""
fi

COUNT_FILE=$(mktemp)
echo "0 0 0" > "$COUNT_FILE"

report_red() {
    echo -e "  ${RED}🔴 RED${NC} $1"
    echo -e "     ${RED}→ $2${NC}"
    read r y g < "$COUNT_FILE"; echo "$(( r + 1 )) $y $g" > "$COUNT_FILE"
}

report_yellow() {
    echo -e "  ${YELLOW}🟡 YELLOW${NC} $1"
    echo -e "     ${YELLOW}→ $2${NC}"
    read r y g < "$COUNT_FILE"; echo "$r $(( y + 1 )) $g" > "$COUNT_FILE"
}

report_green() {
    echo -e "  ${GREEN}🟢 GREEN${NC} $1"
    read r y g < "$COUNT_FILE"; echo "$r $y $(( g + 1 ))" > "$COUNT_FILE"
}

echo -e "${BOLD}📂 File inventory:${NC}"
find "$SKILL_DIR" -type f | sort | while read f; do
    rel="${f#$SKILL_DIR/}"
    size=$(wc -c < "$f")
    echo "  $rel  (${size}B)"
done
echo ""

# === Check 1: Executable files ===
echo -e "${BOLD}1️⃣  Executable files & scripts:${NC}"
EXEC_FILES=$(find "$SKILL_DIR" -type f \( -name "*.sh" -o -name "*.js" -o -name "*.ts" -o -name "*.py" -o -name "*.rb" -o -perm -u=x \) 2>/dev/null)
if [ -z "$EXEC_FILES" ]; then
    report_green "No executable files found — pure text skill"
else
    for f in $EXEC_FILES; do
        rel="${f#$SKILL_DIR/}"
        lines=$(wc -l < "$f")
        echo -e "  📄 ${BOLD}$rel${NC} (${lines} lines)"
    done
    echo ""
fi

# === Check 2: Network access (RED) ===
echo -e "${BOLD}2️⃣  Network access patterns:${NC}"
NET_PATTERNS='curl |wget |fetch(|http://|https://|\.get\(|\.post\(|\.put\(|axios|request\(|XMLHttpRequest|WebSocket|net\.connect|dns\.lookup'
NET_HITS=$(grep -rniE "$NET_PATTERNS" "$SKILL_DIR" --include="*.sh" --include="*.js" --include="*.ts" --include="*.py" 2>/dev/null || true)
if [ -z "$NET_HITS" ]; then
    report_green "No network calls detected in scripts"
else
    echo "$NET_HITS" | while IFS= read -r line; do
        report_red "Network call found" "$line"
    done
fi
echo ""

# === Check 3: Credential/secret access (RED) ===
echo -e "${BOLD}3️⃣  Credential & secret access:${NC}"
CRED_PATTERNS='\.ssh/|\.aws/|\.env|API_KEY|SECRET|TOKEN|PASSWORD|PRIVATE_KEY|credentials|openclaw\.json|\.npmrc|\.gitconfig'
CRED_HITS=$(grep -rniE "$CRED_PATTERNS" "$SKILL_DIR" --include="*.sh" --include="*.js" --include="*.ts" --include="*.py" 2>/dev/null || true)
# Filter out false positives in documentation
CRED_REAL=$(echo "$CRED_HITS" | grep -v "\.md:" | grep -v "# " | grep -v "example" || true)
if [ -z "$CRED_REAL" ]; then
    report_green "No credential access in scripts"
else
    echo "$CRED_REAL" | while IFS= read -r line; do
        report_red "Credential access" "$line"
    done
fi
echo ""

# === Check 4: Dangerous commands (RED) ===
echo -e "${BOLD}4️⃣  Dangerous command patterns:${NC}"
DANGER_PATTERNS='rm -rf|mkfs|dd if=|chmod 777|eval |exec\(|base64 -d|python -c|bash -c|/dev/tcp|nc -|ncat|reverse.shell|iptables'
DANGER_HITS=$(grep -rniE "$DANGER_PATTERNS" "$SKILL_DIR" --include="*.sh" --include="*.js" --include="*.ts" --include="*.py" 2>/dev/null || true)
if [ -z "$DANGER_HITS" ]; then
    report_green "No dangerous commands detected"
else
    echo "$DANGER_HITS" | while IFS= read -r line; do
        report_red "Dangerous command" "$line"
    done
fi
echo ""

# === Check 5: File writes outside skill dir (YELLOW) ===
echo -e "${BOLD}5️⃣  File write patterns:${NC}"
WRITE_PATTERNS='> /|>> /|tee /|mkdir -p /|cp .* /|mv .* /|SOUL\.md|AGENTS\.md|TOOLS\.md|MEMORY\.md|CLAUDE\.md|copilot-instructions'
WRITE_HITS=$(grep -rniE "$WRITE_PATTERNS" "$SKILL_DIR" --include="*.sh" --include="*.js" --include="*.ts" --include="*.py" 2>/dev/null || true)
WRITE_MD=$(grep -rniE "$WRITE_PATTERNS" "$SKILL_DIR" --include="*.md" 2>/dev/null || true)
if [ -z "$WRITE_HITS" ] && [ -z "$WRITE_MD" ]; then
    report_green "No external file writes detected"
else
    if [ -n "$WRITE_HITS" ]; then
        echo "$WRITE_HITS" | while IFS= read -r line; do
            report_yellow "File write in script" "$line"
        done
    fi
    if [ -n "$WRITE_MD" ]; then
        echo "$WRITE_MD" | head -10 | while IFS= read -r line; do
            report_yellow "File write instruction in docs" "$line"
        done
    fi
fi
echo ""

# === Check 6: Hook analysis (YELLOW) ===
echo -e "${BOLD}6️⃣  Hook analysis:${NC}"
HOOKS=$(find "$SKILL_DIR" -path "*/hooks/*" -type f 2>/dev/null)
if [ -z "$HOOKS" ]; then
    report_green "No hooks found"
else
    for f in $HOOKS; do
        rel="${f#$SKILL_DIR/}"
        echo -e "  📎 ${BOLD}$rel${NC}"
        # Check what events the hook handles
        EVENTS=$(grep -oE "(agent:bootstrap|tool:pre|tool:post|message:pre|message:post|session:start|session:end)" "$f" 2>/dev/null || true)
        if [ -n "$EVENTS" ]; then
            report_yellow "Hook events: $EVENTS" "Hook intercepts agent events — review handler logic"
        fi
        # Check if hook modifies context
        CONTEXT_MOD=$(grep -nE "(context\.|bootstrapFiles|push\(|inject|modify|replace)" "$f" 2>/dev/null || true)
        if [ -n "$CONTEXT_MOD" ]; then
            report_yellow "Hook modifies context" "$CONTEXT_MOD"
        fi
    done
fi
echo ""

# === Check 7: Dynamic code execution (YELLOW) ===
echo -e "${BOLD}7️⃣  Dynamic code patterns:${NC}"
DYN_PATTERNS='child_process|spawn\(|execSync|execFile|Function\(|require\(.*\+|import\(.*\+|__import__|compile\('
DYN_HITS=$(grep -rniE "$DYN_PATTERNS" "$SKILL_DIR" --include="*.sh" --include="*.js" --include="*.ts" --include="*.py" 2>/dev/null || true)
if [ -z "$DYN_HITS" ]; then
    report_green "No dynamic code execution"
else
    echo "$DYN_HITS" | while IFS= read -r line; do
        report_yellow "Dynamic code execution" "$line"
    done
fi
echo ""

# === Summary ===
echo -e "${BOLD}════════════════════════════════════════${NC}"
echo -e "${BOLD}  Summary${NC}"
echo -e "${BOLD}════════════════════════════════════════${NC}"
read RED_COUNT YELLOW_COUNT GREEN_COUNT < "$COUNT_FILE"
rm -f "$COUNT_FILE"

echo -e "  ${RED}🔴 RED (block):    ${RED_COUNT}${NC}"
echo -e "  ${YELLOW}🟡 YELLOW (review): ${YELLOW_COUNT}${NC}"
echo -e "  ${GREEN}🟢 GREEN (safe):    ${GREEN_COUNT}${NC}"
echo ""

if [ "$RED_COUNT" -gt 0 ]; then
    echo -e "  ${RED}${BOLD}❌ VERDICT: DO NOT INSTALL — has critical security risks${NC}"
elif [ "$YELLOW_COUNT" -gt 0 ]; then
    echo -e "  ${YELLOW}${BOLD}⚠️  VERDICT: REVIEW REQUIRED — needs human confirmation${NC}"
else
    echo -e "  ${GREEN}${BOLD}✅ VERDICT: SAFE TO INSTALL${NC}"
fi
echo ""
