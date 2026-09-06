#!/usr/bin/env bash
# Shared helpers for the human-in-the-loop feature-approval gate.
#
# The gate: a [feature] task cannot be marked complete until a human has
# approved the CURRENT contents of the project's *.feature files. Approval
# is recorded as a marker file holding a hash of every *.feature file. If
# the feature author later edits a feature, the hash changes, the marker
# no longer matches, and re-approval is required — that is the revision
# loop (human requests a change -> author edits -> re-review -> approve).
#
# Sourced by:
#   - bdd-approve-feature.sh        (writes the marker)
#   - bdd-task-complete-guard.sh    (checks the marker on [feature] complete)
#
# Repo-agnostic: discovers *.feature by globbing, never assumes src/features.

set -u

bdd_root() {
  printf '%s' "${CLAUDE_PROJECT_DIR:-$(pwd)}"
}

bdd_marker_path() {
  printf '%s/.claude/.scratch/approvals/feature.approved' "$(bdd_root)"
}

# Print the sorted list of *.feature files (absolute-ish, repo-relative),
# skipping the usual noise dirs. One per line. Empty output => no features.
bdd_feature_files() {
  local root
  root="$(bdd_root)"
  ( cd "$root" 2>/dev/null || return 0
    find . \
      -type d \( -name node_modules -o -name .git -o -name reports \
                 -o -name dist -o -name build -o -name .claude \) -prune -o \
      -type f -name '*.feature' -print 2>/dev/null | LC_ALL=C sort )
}

# A stable digest of the content of every *.feature file plus their paths,
# so a rename or a body edit both invalidate a prior approval. Prefers
# sha256sum, falls back to shasum, then cksum. Prints just the hex/number.
bdd_feature_digest() {
  local root files h
  root="$(bdd_root)"
  mapfile -t files < <(bdd_feature_files)
  [ "${#files[@]}" -eq 0 ] && { printf 'NO_FEATURES'; return 0; }

  local hasher=""
  if command -v sha256sum >/dev/null 2>&1; then hasher="sha256sum"
  elif command -v shasum   >/dev/null 2>&1; then hasher="shasum -a 256"
  fi

  ( cd "$root" 2>/dev/null || return 0
    if [ -n "$hasher" ]; then
      # hash "<path>\n<file bytes>" for each, then hash the concatenation
      for f in "${files[@]}"; do
        printf '%s\n' "$f"
        cat "$f"
        printf '\0'
      done | $hasher | awk '{print $1}'
    else
      # last resort: cksum over the same stream
      for f in "${files[@]}"; do printf '%s\n' "$f"; cat "$f"; printf '\0'; done \
        | cksum | awk '{print $1"-"$2}'
    fi )
}
