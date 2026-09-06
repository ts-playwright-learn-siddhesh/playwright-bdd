#!/usr/bin/env bash
# PreToolUse hook for the state-changing claude-in-chrome tools:
#   mcp__claude-in-chrome__form_input
#   mcp__claude-in-chrome__computer
#   mcp__claude-in-chrome__javascript_tool
#
# These tools are deliberately NOT in permissions.allow, so by default every
# call prompts the human in the lead session — that IS the human-in-the-loop
# gate for browser writes. This hook's only job is to SUPPRESS that prompt
# when it can prove the action targets an approved throwaway host, so a
# normal demo-site run isn't death-by-a-thousand-prompts.
#
#   - target host is on the allow-list  -> emit {"permissionDecision":"allow"}  (no prompt)
#   - host unknown / not on the list     -> exit 0 silently -> the normal
#                                           permission prompt fires (human decides)
#
# The hook never denies and never force-asks; "not proven safe" simply falls
# through to Claude Code's own prompt. Fail-safe: if no host can be read from
# the tool input, it does NOT suppress the prompt.
#
# Allow-list: BDD_SITE_WRITE_ALLOW (comma/space separated) or the default.
# Suffix match, so "www.automationexercise.com" and sub-domains also match.

set -u
INPUT=$(cat)

ALLOW="${BDD_SITE_WRITE_ALLOW:-automationexercise.com}"
ALLOW=$(printf '%s' "$ALLOW" | tr ',;' '  ')

# Pull any URL-ish value from the tool input. claude-in-chrome tool inputs
# vary; check the fields a URL could plausibly live in.
if command -v jq >/dev/null 2>&1; then
  URL=$(printf '%s' "$INPUT" | jq -r '
      .tool_input.url
      // .tool_input.href
      // .tool_input.target
      // .tool_input.page_url
      // ""' 2>/dev/null)
else
  URL=$(printf '%s' "$INPUT" | grep -oE '"(url|href|page_url)"[[:space:]]*:[[:space:]]*"[^"]*"' \
        | head -n1 | sed 's/.*:[[:space:]]*"//; s/"$//')
fi

# No URL in the tool input -> can't prove it's safe -> let the prompt fire.
[ -z "$URL" ] && exit 0

HOST=$(printf '%s' "$URL" | sed -E 's#^[a-zA-Z]+://##; s#/.*$##; s#^[^@]*@##; s#:[0-9]+$##' | tr 'A-Z' 'a-z')
[ -z "$HOST" ] && exit 0

for a in $ALLOW; do
  [ -z "$a" ] && continue
  a=$(printf '%s' "$a" | tr 'A-Z' 'a-z')
  case "$HOST" in
    "$a"|*.".$a"|*."$a")
      cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": "HITL: approved throwaway host ($HOST) — auto-allowed for the BDD run."
  }
}
EOF
      exit 0
      ;;
  esac
done

# Host not on the allow-list: stay silent so the human sees the normal prompt.
exit 0
