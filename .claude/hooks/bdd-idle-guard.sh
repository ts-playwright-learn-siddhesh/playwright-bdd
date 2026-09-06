#!/usr/bin/env bash
# TeammateIdle hook — refuse to let a teammate go idle while its work is
# provably unfinished. Exit 2 keeps the teammate working and feeds stderr
# back to it as the reason.
#
# Enforced (matches write-step-defs/reference/step-def-standards.md §7
# "Definition of done"):
#   - no `MISSING` selector marker left in any page object
#   - no `// TODO` left in a generated step-definition file
#
# Repo-agnostic: it discovers the page-object and step-def dirs by globbing
# for the file-name conventions, not by assuming `src/pages` / `src/step-definitions`.
#
# This hook has no matcher (TeammateIdle never does) so it fires for every
# teammate. A teammate that legitimately has nothing to do — the feature
# author, the read-only suite runner — has no MISSING/TODO markers in the
# tree, so it passes straight through.

set -u
ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$ROOT" || exit 0   # can't cd -> don't block

# Collect candidate files. Prune noise dirs. Tolerate a repo with no matches.
mapfile -t PAGE_FILES < <(find . \
  -type d \( -name node_modules -o -name .git -o -name reports -o -name dist -o -name build \) -prune -o \
  -type f -name '*.page.ts' -print 2>/dev/null)
mapfile -t STEP_FILES < <(find . \
  -type d \( -name node_modules -o -name .git -o -name reports -o -name dist -o -name build \) -prune -o \
  -type f -name '*.steps.ts' -print 2>/dev/null)

problems=""

if [ "${#PAGE_FILES[@]}" -gt 0 ]; then
  hits=$(grep -l -E 'MISSING' "${PAGE_FILES[@]}" 2>/dev/null || true)
  if [ -n "$hits" ]; then
    problems+="Unresolved MISSING selector marker(s) in page object(s):\n"
    while IFS= read -r f; do
      [ -n "$f" ] && problems+="  $f\n$(grep -n -E 'MISSING' "$f" | sed 's/^/    /')\n"
    done <<< "$hits"
  fi
fi

if [ "${#STEP_FILES[@]}" -gt 0 ]; then
  hits=$(grep -l -E '//[[:space:]]*TODO' "${STEP_FILES[@]}" 2>/dev/null || true)
  if [ -n "$hits" ]; then
    problems+="Unresolved // TODO in step-definition file(s):\n"
    while IFS= read -r f; do
      [ -n "$f" ] && problems+="  $f\n$(grep -n -E '//[[:space:]]*TODO' "$f" | sed 's/^/    /')\n"
    done <<< "$hits"
  fi
fi

if [ -n "$problems" ]; then
  printf 'Not done yet — resolve these before going idle:\n%b' "$problems" >&2
  printf 'Explore the missing selector on the live site, add it to the scratch selmap, delete the affected *.page.ts, and re-run the emit step. Replace every // TODO with a real assertion or Page Object call.\n' >&2
  exit 2
fi

exit 0
