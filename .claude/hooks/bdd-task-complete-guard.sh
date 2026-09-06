#!/usr/bin/env bash
# TaskCompleted hook — block a phase task from being marked done until its
# real deliverable exists. Exit 2 blocks completion and feeds stderr back.
#
#   [feature] .. -> a HUMAN must have approved the current *.feature files
#                   (marker written by bdd-approve-feature.sh, digest must
#                   match the current feature contents). This is the
#                   human-in-the-loop gate: [steps] cannot start until the
#                   human signs off, and any later feature edit invalidates
#                   the approval so the revised file is reviewed again.
#   [steps] ...  -> the Cucumber bind check (`--dry-run`) must report
#                   0 undefined and 0 ambiguous steps.
#   [run]   ...  -> a triage report file must exist under .claude/.scratch/.
#   [chore] ...  -> not gated here.
#
# Repo-agnostic:
#   - finds the feature dir by globbing for *.feature
#   - finds the cucumber run command by scanning package.json "scripts" for one
#     that invokes @cucumber/cucumber; falls back to the direct tsx incantation
#   - never assumes the script is called "cucumberTs"

set -u
INPUT=$(cat)
ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$ROOT" || exit 0
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if command -v jq >/dev/null 2>&1; then
  SUBJECT=$(printf '%s' "$INPUT" | jq -r '.task_subject // ""')
else
  SUBJECT=$(printf '%s' "$INPUT" | grep -o '"task_subject"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"task_subject"[[:space:]]*:[[:space:]]*"//; s/"$//')
fi

case "$SUBJECT" in
  "[feature]"*)
    # Human-in-the-loop: the feature file(s) must be approved by a person,
    # and the approval must be for the CURRENT contents (digest match).
    # shellcheck source=./bdd-feature-approval-lib.sh
    . "$HERE/bdd-feature-approval-lib.sh"
    MARKER="$(bdd_marker_path)"
    CURRENT="$(bdd_feature_digest)"

    if [ "$CURRENT" = "NO_FEATURES" ]; then
      echo "[feature] task not done: no *.feature file was produced. The feature author must write at least one feature before this task can close." >&2
      exit 2
    fi

    if [ ! -f "$MARKER" ]; then
      echo "[feature] task NOT approved by the human yet." >&2
      echo "Present the feature file(s) to the human for review. Do NOT mark this task complete or let [steps] start." >&2
      echo "When the human approves: run  bash .claude/hooks/bdd-approve-feature.sh" >&2
      echo "When the human requests changes: relay them to the feature author, wait for the revision, then present again." >&2
      exit 2
    fi

    SAVED="$(grep -E '^digest=' "$MARKER" | head -n1 | sed 's/^digest=//')"
    if [ "$SAVED" != "$CURRENT" ]; then
      echo "[feature] approval is STALE — the feature file(s) changed since the human approved (approved digest $SAVED, current $CURRENT)." >&2
      echo "Show the human the revised feature file(s). On approval, re-run  bash .claude/hooks/bdd-approve-feature.sh  then complete this task." >&2
      exit 2
    fi

    exit 0
    ;;

  "[run]"*)
    if ls "$ROOT"/.claude/.scratch/run-tests-triage/*triage* >/dev/null 2>&1 \
       || ls "$ROOT"/.claude/.scratch/*triage* >/dev/null 2>&1; then
      exit 0
    fi
    echo "[run] task not done: no triage report found under .claude/.scratch/. Run the run-tests-triage skill's driver so it writes a report before marking this complete." >&2
    exit 2
    ;;

  "[steps]"*)
    # locate a feature dir
    FEATURE_DIR=$(find . \
      -type d \( -name node_modules -o -name .git -o -name reports -o -name dist -o -name build \) -prune -o \
      -type f -name '*.feature' -print 2>/dev/null | head -n1 | xargs -r dirname)
    if [ -z "${FEATURE_DIR:-}" ]; then
      # no features at all -> nothing to bind-check, let it pass
      exit 0
    fi

    # find a run command
    RUN_CMD=""
    if [ -f package.json ] && command -v jq >/dev/null 2>&1; then
      SCRIPT_NAME=$(jq -r '.scripts // {} | to_entries[] | select(.value | test("@cucumber/cucumber")) | .key' package.json 2>/dev/null | head -n1)
      [ -n "${SCRIPT_NAME:-}" ] && RUN_CMD="npm run $SCRIPT_NAME --"
    fi
    if [ -z "$RUN_CMD" ] && [ -f node_modules/@cucumber/cucumber/bin/cucumber.js ]; then
      RUN_CMD="node --import tsx node_modules/@cucumber/cucumber/bin/cucumber.js"
    fi
    if [ -z "$RUN_CMD" ]; then
      echo "[steps] task: cannot find a Cucumber run command (no matching package.json script, no @cucumber/cucumber in node_modules). Install deps / add a script, then re-verify with --dry-run." >&2
      exit 2
    fi

    OUT=$(cd "$ROOT" && eval "$RUN_CMD \"$FEATURE_DIR\"/**/*.feature --dry-run" 2>&1)
    if printf '%s' "$OUT" | grep -qE 'undefined|ambiguous'; then
      echo "[steps] task not done: --dry-run reports undefined/ambiguous steps:" >&2
      printf '%s\n' "$OUT" | grep -E 'undefined|ambiguous|scenarios?|steps?' | tail -n 20 >&2
      echo "Fix the bindings (add the missing step defs / phrase shared actions identically) before marking complete." >&2
      exit 2
    fi
    exit 0
    ;;

  *)
    exit 0
    ;;
esac
