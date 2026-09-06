#!/usr/bin/env bash
# TaskCreated hook — keep the shared task list legible for a 3-role BDD team.
# Exit 2 (or {"decision":"block"}) deletes the task and returns the message
# to the lead as the tool error, so it re-creates the task named correctly.
#
# Convention: every task subject starts with one of these tags so the lead
# and teammates can see at a glance which phase a task belongs to:
#   [feature]  - drive the site, write .feature files      (bdd-feature-author)
#   [steps]    - step defs / page objects / World / logger (bdd-step-implementer)
#   [run]      - run the suite, triage, static audit       (bdd-suite-runner)
#   [chore]    - anything else the lead needs tracked
#
# Repo-agnostic: pure string check on the task subject, no filesystem assumptions.

set -u
INPUT=$(cat)

# jq is used by the documented hook examples; fall back to a grep if absent.
if command -v jq >/dev/null 2>&1; then
  SUBJECT=$(printf '%s' "$INPUT" | jq -r '.task_subject // ""')
else
  SUBJECT=$(printf '%s' "$INPUT" | grep -o '"task_subject"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"task_subject"[[:space:]]*:[[:space:]]*"//; s/"$//')
fi

case "$SUBJECT" in
  "[feature]"*|"[steps]"*|"[run]"*|"[chore]"*)
    exit 0
    ;;
  *)
    echo "Task subject must start with a phase tag: [feature], [steps], [run], or [chore]. Got: \"$SUBJECT\". Example: \"[steps] implement login.feature step definitions and LoginPage\"." >&2
    exit 2
    ;;
esac
