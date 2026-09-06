#!/usr/bin/env bash
# Record HUMAN approval of the current *.feature files.
#
# Run this ONLY when the human has reviewed the feature file(s) and said to
# proceed. It writes the approval marker with a digest of the current
# feature contents. The [feature] TaskCompleted guard then lets the task
# close and the [steps] task unblock.
#
# Usage (from the project root, or with CLAUDE_PROJECT_DIR set):
#   bash .claude/hooks/bdd-approve-feature.sh            # approve
#   bash .claude/hooks/bdd-approve-feature.sh --status   # show current state
#   bash .claude/hooks/bdd-approve-feature.sh --revoke   # drop the approval
#
# Not a hook — a helper the lead invokes on the human's explicit say-so.

set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./bdd-feature-approval-lib.sh
. "$HERE/bdd-feature-approval-lib.sh"

MARKER="$(bdd_marker_path)"
mkdir -p "$(dirname "$MARKER")" 2>/dev/null

DIGEST="$(bdd_feature_digest)"
NFEAT="$(bdd_feature_files | grep -c . || true)"

case "${1:-}" in
  --status)
    echo "feature files:      $NFEAT"
    echo "current digest:     $DIGEST"
    if [ -f "$MARKER" ]; then
      SAVED="$(grep -E '^digest=' "$MARKER" | head -n1 | sed 's/^digest=//')"
      WHEN="$(grep -E '^approved_at=' "$MARKER" | head -n1 | sed 's/^approved_at=//')"
      echo "approved digest:    $SAVED"
      echo "approved at:        $WHEN"
      if [ "$SAVED" = "$DIGEST" ]; then
        echo "state:              APPROVED (matches current features)"
      else
        echo "state:              STALE (features changed since approval — re-approve needed)"
      fi
    else
      echo "state:              NOT APPROVED (no marker)"
    fi
    exit 0
    ;;
  --revoke)
    rm -f "$MARKER"
    echo "feature approval revoked ($MARKER removed)."
    exit 0
    ;;
  ""|--approve)
    if [ "$NFEAT" -eq 0 ]; then
      echo "refusing to approve: no *.feature files found under the project." >&2
      exit 1
    fi
    {
      echo "# Human approval of the BDD feature file(s)."
      echo "# Written by bdd-approve-feature.sh on the human's explicit say-so."
      echo "digest=$DIGEST"
      echo "approved_at=$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
      echo "feature_count=$NFEAT"
      echo "# files:"
      bdd_feature_files | sed 's/^/#   /'
    } > "$MARKER"
    echo "feature approval recorded for $NFEAT file(s), digest $DIGEST."
    echo "the [feature] task can now be completed; [steps] will unblock."
    exit 0
    ;;
  *)
    echo "usage: bdd-approve-feature.sh [--approve|--status|--revoke]" >&2
    exit 2
    ;;
esac
