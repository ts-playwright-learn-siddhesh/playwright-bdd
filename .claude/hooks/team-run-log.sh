#!/usr/bin/env bash
# SubagentStop hook — append each teammate's final report to a durable log.
# In-process teammates are NOT restored by /resume or /rewind (documented
# agent-teams limitation), so their transcripts are otherwise lost on restart.
# This keeps a plain-text record of what each teammate concluded.
#
# Writes to .claude/.scratch/ (gitignored) — never travels between repos.
# Non-blocking: always exits 0.

set -u
INPUT=$(cat)
ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
OUT_DIR="$ROOT/.claude/.scratch"
mkdir -p "$OUT_DIR" 2>/dev/null || exit 0
LOG="$OUT_DIR/team-run-$(date +%Y%m%d).md"

if command -v jq >/dev/null 2>&1; then
  AGENT=$(printf '%s' "$INPUT" | jq -r '.agent_type // "unknown"')
  MSG=$(printf '%s' "$INPUT" | jq -r '.last_assistant_message // ""')
else
  # jq absent: pull the two fields with sed. agent_type is a short token;
  # last_assistant_message is free text that may run to the end of the object.
  AGENT=$(printf '%s' "$INPUT" | sed -n 's/.*"agent_type"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
  [ -z "$AGENT" ] && AGENT=unknown
  MSG=$(printf '%s' "$INPUT" | sed -n 's/.*"last_assistant_message"[[:space:]]*:[[:space:]]*"\(.*\)"[[:space:]]*}[[:space:]]*$/\1/p')
fi

{
  printf '\n---\n## %s — %s\n\n' "$(date '+%H:%M:%S')" "$AGENT"
  printf '%s\n' "$MSG"
} >> "$LOG" 2>/dev/null

exit 0
