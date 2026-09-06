#!/usr/bin/env bash
# PreToolUse hook (matcher: Write|Edit) — force a HUMAN confirmation prompt
# before a teammate writes to the SHARED / CONFIG surface of the suite:
#
#   - cucumber.js / cucumber.cjs           (run config)
#   - src/support/**  (World, hooks, data, logger — shared by every scenario)
#   - **/pages/index.ts  (the page-object registry: interface + factory)
#
# Ordinary *.page.ts / *.steps.ts / *.feature edits pass straight through
# (they are the teammates' normal deliverable and are already covered by
# the idle guard, the dry-run gate, and the feature-approval gate).
#
# Emits {"permissionDecision":"ask", ...} so the lead session shows the
# prompt EVEN in acceptEdits / auto mode. It never denies — the human
# decides at the prompt. Deny/allow rules in settings still apply on top.
#
# Repo-agnostic: pure path matching on the tool input, no fs assumptions.

set -u
INPUT=$(cat)

if command -v jq >/dev/null 2>&1; then
  FP=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // ""')
else
  FP=$(printf '%s' "$INPUT" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -n1 | sed 's/.*:[[:space:]]*"//; s/"$//')
fi

# nothing to check -> don't get in the way
[ -z "$FP" ] && exit 0

# normalise separators: use forward slashes everywhere. This both simplifies
# path matching AND keeps the value safe to drop into a JSON string (a raw
# backslash from a Windows path would make invalid JSON like "\t").
NP=$(printf '%s' "$FP" | tr '\\' '/')
DISP="$NP"

needs_confirm=0
reason=""

case "$NP" in
  */cucumber.js|*/cucumber.cjs|cucumber.js|cucumber.cjs)
    needs_confirm=1; reason="Cucumber run config ($DISP)";;
  */support/*|*/src/support/*)
    needs_confirm=1; reason="shared support code ($DISP) — World / hooks / data / logger affect every scenario";;
  */pages/index.ts|*/src/pages/index.ts)
    needs_confirm=1; reason="the page-object registry ($DISP) — interface + factory shared across the suite";;
esac

if [ "$needs_confirm" -eq 1 ]; then
  cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "ask",
    "permissionDecisionReason": "HITL: about to modify $reason. Review the change before allowing."
  }
}
EOF
  exit 0
fi

exit 0
