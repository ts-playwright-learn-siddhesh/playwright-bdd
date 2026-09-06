---
name: ship-pr
description: Commit the current changes and open a pull request for this Playwright + Cucumber-BDD + TypeScript project. Handles a repo that is not yet under git (git init + gh repo create), runs the BDD quality bar first, writes a Conventional-Commits message from the real diff, and opens the PR with the required trailers/body. Use when asked to "commit and open a PR", "ship this", "raise a PR", "/ship-pr".
disable-model-invocation: true
argument-hint: "[optional: base branch or short PR title]"
allowed-tools: >
  Bash(git status*), Bash(git diff*), Bash(git log*), Bash(git branch*),
  Bash(git rev-parse*), Bash(git symbolic-ref*), Bash(git remote*),
  Bash(git add *), Bash(git restore --staged*), Bash(git init*),
  Bash(git checkout -b *), Bash(git switch -c *), Bash(git switch *),
  Bash(git commit -m *), Bash(git push*),
  Bash(gh auth status*), Bash(gh repo view*), Bash(gh repo create*),
  Bash(gh pr create*), Bash(gh pr view*), Bash(gh pr list*),
  Bash(npm run cucumberTs*), Bash(node .claude/skills/**),
  Bash(bash .claude/hooks/bdd-approve-feature.sh*)
---

You are running the **ship-pr** workflow for this repo. Follow these steps in
order. Stop and ask the user if a **STOP** condition is hit. Do not skip the
quality bar, and never force-push.

`$1` (optional) is either a base branch name or a short PR title — infer which
from its value (a value matching an existing branch is the base; otherwise it
is a title hint).

---

## 1. Read the current state (no writes yet)

Run, and read the output before doing anything:

```
git rev-parse --is-inside-work-tree 2>&1
```

- **Not a git repo** → go to **1a**.
- **Is a git repo** → run `git status --porcelain`, `git branch --show-current`,
  `git log --oneline -5`, `git remote -v`, `gh repo view --json nameWithOwner -q .nameWithOwner 2>&1`. Then go to **2**.

### 1a. Repo is not under git

Tell the user plainly: *"This project isn't a git repository yet. To open a PR I
need to `git init`, make the first commit, and create a GitHub repo."* Then ask
**one** question: private or public repo, and the repo name (default: the
directory name, `playwright-bdd`).

On their answer:

```
git init
git symbolic-ref HEAD refs/heads/main        # ensure the default branch is 'main'
```

`.gitignore` already exists in this repo — confirm it lists `node_modules/`,
`reports/`, `logs/`, `.claude/.scratch/` (it does). Do **not** create a new one.

Do NOT create the GitHub repo yet — that happens in step 6 after the user has
seen what will be committed. Continue to **2** treating this as "first commit,
branch = main, no remote".

---

## 2. Quality bar — must pass before a commit

This is a Playwright + Cucumber-BDD suite. Run the checks that apply:

1. **Cucumber bind check** (always):
   ```
   npm run cucumberTs -- --dry-run
   ```
   Must report **0 undefined, 0 ambiguous**. If it doesn't → **STOP**, show the
   output, tell the user the steps aren't wired and a PR would be red.

2. **Feature-approval gate** (only if a team run is in flight — i.e. the shared
   task list has an open `[feature]` or `[steps]` task, or
   `.claude/.scratch/approvals/feature.approved` is stale/missing while
   `src/features/*.feature` has uncommitted changes):
   ```
   bash .claude/hooks/bdd-approve-feature.sh --status
   ```
   If it says `STALE` or `NOT APPROVED` and features are among the changes →
   **STOP**. Tell the user the feature file(s) still need their approval
   (`bash .claude/hooks/bdd-approve-feature.sh`) before shipping.

3. **Type check** if a script exists (`npm run type-check` is defined here) —
   run it; a failure is a **STOP** with the output shown.

Do NOT run the full live suite from this skill (it creates real accounts on the
demo site). If the user wants that, they run `/ship-pr` after a green
suite-runner pass.

---

## 3. Show the user what will be committed

```
git add -A
git diff --cached --stat
```

Then scan the staged diff for problems and **STOP** if you see any:

- secrets / tokens / credentials / `.env` contents / private keys
- large binaries or `node_modules` / `reports/` / `logs/` slipping past
  `.gitignore`
- unrelated debug scratch (`console.log` left in, `.only` on a scenario/test,
  commented-out blocks)
- a `*.feature` change with no matching approval (see 2.2)

If `git add -A` staged something that shouldn't ship, `git restore --staged <path>`
it and tell the user.

Print a short summary: files changed, insertions/deletions, and the one-line
intent you inferred. Ask the user to confirm the intent is right before you
commit. (Committing is reversible; the PR in step 6 is not, so this is the light
checkpoint.)

---

## 4. Branch

- **First commit on a fresh repo** → stay on `main` (there is nothing to branch
  from yet). The PR is created from `main` later only if a remote default branch
  differs; otherwise the first push establishes `main` and a follow-up PR is
  branch-based. In practice: for a brand-new repo, make the first commit on
  `main`, push it, then create a working branch for subsequent changes.
- **Existing repo, currently on the default branch** (`main`/`master`) → create a
  branch: `git switch -c <type>/<short-slug>` where `<type>` is `feat`/`fix`/
  `chore`/`test`/`docs` matching the change, and `<short-slug>` is 2–4 words from
  the intent (e.g. `chore/hitl-approval-gates`). Honour `$1` if it named a base
  or gave a title.
- **Existing repo, already on a feature branch** → stay on it.

Never commit straight to `main`/`master` on an established repo.

## 5. Commit

Write a **Conventional Commits** message from the ACTUAL staged diff — not from
memory of the conversation:

```
<type>(<optional scope>): <imperative summary, <= 72 chars>

<body: what changed and why, wrapped at 72 cols. Bullet list is fine.
Reference the .feature / step / page / hook files touched.>

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0136NPpoycYs3kH5FTBkBYe5
```

Commit with `git commit -m "$(cat <<'EOF' ... EOF)"` (heredoc, so the body and
trailers are preserved). Then `git log --oneline -1` to confirm.

## 6. Push and open the PR  (outward-facing — confirm first)

Tell the user exactly what you're about to do (create the GitHub repo if
needed, push branch X, open a PR into Y) and get an explicit go-ahead. Then:

**If there is no remote yet:**
```
gh repo create <name> --<private|public> --source=. --remote=origin --push
```
That pushes `main`. Then, if there are changes beyond the first commit that
belong on a branch, create it now, `git push -u origin <branch>`, and PR from it.

**If a remote exists:**
```
git push -u origin <current-branch>
```

**Open the PR:**
```
gh pr create --base <default-branch> --head <current-branch> \
  --title "<type>: <summary>" \
  --body "$(cat <<'EOF'
## What

<1–3 sentences: what this PR does>

## Why

<the reason / the ask it addresses>

## How it was verified

- `npm run cucumberTs -- --dry-run` — 0 undefined / 0 ambiguous
- <type-check result, feature-approval state, any suite run>

## Files

<the notable files changed, grouped>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Do **not** pass `--fill` (write a real body). Do **not** merge the PR. Do **not**
`git push --force` — if the remote rejects the push, stop and report why.

## 7. Report

Give the user: the branch name, the commit hash + subject, and the PR URL
(`gh pr view --json url -q .url`). If CI is configured, tell them to watch the
checks before merging.

---

## Never

- Commit or push secrets, `.env`, credentials, or anything `.gitignore` is meant
  to catch.
- Force-push, amend a pushed commit, or rewrite shared history.
- Merge the PR or mark it ready without the user asking.
- Skip the `--dry-run` bind check or the feature-approval check.
- Commit straight to `main`/`master` on an established repo.
