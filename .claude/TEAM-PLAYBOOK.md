# Agent-team playbook — Playwright + Cucumber-BDD + TypeScript

A 3-teammate agent team that takes a URL from **feature files → runnable
step code → verified run**. There is no team config file to author
(`~/.claude/teams/…/config.json` is runtime state, auto-generated and
overwritten; a project `.claude/teams/teams.json` is ignored). This
markdown is the reusable artifact — you paste the spawn prompt from here.

Reference: <https://code.claude.com/docs/en/agent-teams>

---

## Prerequisites (both are required)

Set in `.claude/settings.json` `env` (travels with the repo). **The docs
say to have these set before Claude Code starts — a clean restart after
editing settings is the safe path.**

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1",
    "CLAUDE_CODE_ENABLE_TODO_TOOLS": "1"
  },
  "subagentPromptCacheTtl": "1h"
}
```

1. **`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`** — without it, no team
   forms; asking for teammates spawns ordinary subagents.
2. **`CLAUDE_CODE_ENABLE_TODO_TOOLS=1`** — on Sonnet 5 / Opus 4.8 / Fable
   5 and later, the `TaskCreate` / `TaskGet` / `TaskList` / `TaskUpdate`
   tools are **off by default**. Without them there is **no shared task
   list**: the lead can't create dependency-ordered tasks and teammates
   can't self-claim — the pipeline degrades to the lead hand-messaging
   "your turn now" to each teammate. The lead must have this set;
   in-process teammates inherit it.
3. **`subagentPromptCacheTtl: "1h"`** — an in-process teammate's cache
   otherwise holds only 5 minutes, so a teammate idle for 10+ min while
   another drives the browser pays repeated cold cache writes. (1-hour
   cache writes bill slightly higher — fine for this workflow.)

### Platform note

You're on **Windows → in-process mode only** (split panes need
tmux/iTerm2, unsupported in Windows Terminal). Teammates appear in the
agent panel below the prompt; ↑/↓ to select, Enter to view/message,
`x` to stop one, Ctrl+T to toggle the task list.

---

## The roles

| Teammate | Agent type | Owns (writes) | Uses skills |
|---|---|---|---|
| **feature-author** | `bdd-feature-author` | `.feature` files only | `gen-feature` |
| **step-implementer** | `bdd-step-implementer` | step defs, page objects, World, hooks, cucumber config, logger | `write-step-defs`, then `add-logger` |
| **suite-runner** | `bdd-suite-runner` | *nothing — read-only* | `run-tests-triage`, `page-object-audit` |

Teammates don't inherit an agent definition's `skills:` frontmatter (the
docs are explicit) — they load skills from project/user settings, which
is why the role cards **name the skills in prose** and the skills live in
`.claude/skills/`.

### `/ship-pr` — commit + open a PR (lead only, after the run)

`.claude/skills/ship-pr/SKILL.md`. User-invoked (`disable-model-invocation:
true`); **not** part of the team pipeline — the lead runs it once the three
tasks are done and the changes are worth a PR. It:

1. Detects a **non-git repo** (this project starts as one) and walks the
   user through `git init` + `gh repo create` before the first commit.
2. Runs the quality bar first: `cucumber --dry-run` must be 0/0; if a team
   run is mid-flight it also checks the feature-approval marker
   (`bdd-approve-feature.sh --status`) and `npm run type-check`.
3. Stages, scans the diff for secrets / stray `reports/` `logs/` /
   `.only` / left-in debug, shows the user, writes a Conventional-Commits
   message **from the real diff**, commits with the required
   `Co-Authored-By` + `Claude-Session` trailers.
4. Branches (`<type>/<slug>`, never straight to `main` on an established
   repo), pushes, opens the PR with the required body footer. Confirms
   before the outward step. Never force-pushes, never merges.

`gh` must be installed and authed (`gh auth status`). The skill's
`allowed-tools` pre-approves the specific `git`/`gh` calls so the lead
isn't prompted for each one.

---

## File ownership (the #1 team hazard is two teammates editing one file)

```
<feature-dir>/*.feature          -> feature-author        (step-implementer: READ ONLY)
<pages-dir>/*.page.ts            -> step-implementer
<steps-dir>/*.steps.ts          -> step-implementer
<support-dir>/world.ts, hooks.ts -> step-implementer
<support-dir>/logger.ts          -> step-implementer (via add-logger)
cucumber.js / cucumber.cjs       -> step-implementer
.claude/.scratch/**              -> whichever skill writes it (gitignored, per-repo)
```

The suite-runner writes nothing. The lead hand-merges the page-object
index if features arrive in two waves (`scaffold.mjs` writes that file
once).

---

## Spawn prompt (paste this, filling in the URL)

> Spawn 3 teammates for a Playwright-BDD end-to-end pass against
> `<URL>`. Use Sonnet for each. Give them these names and agent types:
>
> - **feature-author**, using the `bdd-feature-author` agent type: drive
>   `<URL>` and produce `.feature` files in the project's detected
>   feature directory. It owns `.feature` files only.
> - **step-implementer**, using the `bdd-step-implementer` agent type:
>   once the feature files exist, write step definitions + page objects +
>   World + hooks, then add the winston logger. It owns `<pages-dir>`,
>   `<steps-dir>`, `<support-dir>` and the cucumber config. It must wait
>   for feature-author before starting.
> - **suite-runner**, using the `bdd-suite-runner` agent type: after
>   step-implementer reports done, run the suite, triage failures, and
>   run the page-object audit. It is read-only.
>
> Create tasks with a `[feature]` / `[steps]` / `[run]` subject prefix
> and these dependencies: the `[steps]` task depends on the `[feature]`
> task; the `[run]` task depends on the `[steps]` task. Wait for each
> teammate to finish its task before advancing the next.
>
> **After feature-author reports done, do NOT complete the `[feature]`
> task or release step-implementer.** Show me the feature file(s) and
> wait for my decision. If I approve, run
> `bash .claude/hooks/bdd-approve-feature.sh`, then complete `[feature]`.
> If I ask for changes, relay them to feature-author, wait for the
> revision, and show me again. Only an approved feature file unblocks
> `[steps]` (a `TaskCompleted` hook enforces this).
>
> When all three are done, synthesize a final report: features written,
> files generated, run pass/fail counts, triage, audit findings, and any
> `.feature`/site mismatches.

If the lead starts implementing itself instead of waiting:
> Wait for your teammates to complete their tasks before proceeding.

If the lead spawned subagents instead of a team (they look the same in
the panel):
> Spawn them as an agent team, not subagents.

---

## Ordering rule (was the `code-writer` agent, now the lead's job)

On a **fresh** scaffold the step-implementer runs `write-step-defs`
**first** (it creates the World + hooks), then `add-logger` **second** —
`add-logger` against a repo with no World falls back to a module-level
logger with no `this.log` wiring. On an **established** project the order
doesn't matter. Both skills edit `world.ts` / `hooks.ts`, so the
step-implementer runs one to completion before the other, never
interleaved. Its role card already encodes this; the lead just shouldn't
split logging into a separate teammate.

---

## Quality-gate hooks — LIVE in this repo's `.claude/settings.json`

Wired 2026-09-05. Scripts in `.claude/hooks/` (portable — copy with the
rest).

| Hook | Script | Effect |
|---|---|---|
| `PreToolUse` (`Write`\|`Edit`) | `bdd-confirm-source-write.sh` | emits `permissionDecision: "ask"` — **human confirms** — for a write to `cucumber.js`, `src/support/**`, or `**/pages/index.ts` (the shared/config surface). Ordinary `*.page.ts` / `*.steps.ts` / `*.feature` edits pass silently. |
| `PreToolUse` (`form_input`\|`computer`\|`javascript_tool`) | `bdd-confirm-site-write.sh` | emits `"allow"` (no prompt) when the target host is on the allow-list (`BDD_SITE_WRITE_ALLOW`, default `automationexercise.com`); stays silent otherwise so the **normal permission prompt** reaches the human. Never denies. |
| `TeammateIdle` | `bdd-idle-guard.sh` | blocks a teammate going idle while any `MISSING` selector marker or `// TODO` remains in a `*.page.ts` / `*.steps.ts` — feeds the file list back |
| `TaskCreated` | `bdd-task-name.sh` | rejects a task whose subject isn't prefixed `[feature]` / `[steps]` / `[run]` / `[chore]` |
| `TaskCompleted` | `bdd-task-complete-guard.sh` | **`[feature]`: blocks completion until a human runs `bdd-approve-feature.sh` and the approval still matches the current feature contents** (the human-in-the-loop gate); `[steps]`: blocks until `--dry-run` is clean; `[run]`: blocks until a triage report exists |
| `SubagentStop` | `team-run-log.sh` | appends each teammate's final report to `.claude/.scratch/team-run-<date>.md` (in-process teammates aren't restored by `/resume`, so their transcripts are otherwise lost) |

`TaskCreated` / `TaskCompleted` only fire when the Task tools are on
(prerequisite #2). `PreToolUse`, `TeammateIdle`, and `SubagentStop` fire
regardless.

The scripts prefer `jq` and fall back to `sed`/`grep` if `jq` isn't on
PATH (as in the environment they were built in) — both paths are tested.

Also in `.claude/settings.json`: a `permissions.allow` list pre-approving
the skills' scripts, the cucumber run command, and the **read-only**
claude-in-chrome tools, so the **lead** (where teammate permission
prompts surface) isn't hammered while two teammates work. `Write`/`Edit`
still prompt, and — per the human-in-the-loop wiring below — the three
state-changing claude-in-chrome tools (`form_input`, `computer`,
`javascript_tool`) are **deliberately not allow-listed**; the
`bdd-confirm-site-write.sh` hook suppresses their prompt only on an
approved host.

---

## Human-in-the-loop: feature approval gate

Added 2026-09-06 (per the Claude Code docs on `PreToolUse` decision
control and `TaskCompleted` hooks). The `[feature] → [steps] → [run]`
chain now has a **mandatory human checkpoint between `[feature]` and
`[steps]`**.

**Flow:**

1. `feature-author` writes the `.feature` file(s), reports to the lead,
   and stops — it does **not** complete its own `[feature]` task.
2. The lead presents the feature file(s) to the human.
3. Human decides:
   - **Approve** → lead runs `bash .claude/hooks/bdd-approve-feature.sh`
     (records a marker holding a digest of every `*.feature` file), then
     marks the `[feature]` task complete. `[steps]` unblocks.
   - **Request changes** → lead relays the exact asks to `feature-author`,
     which revises and reports again. Go to step 2.
4. Any feature edit changes the digest, so a prior approval goes **stale**
   and the gate blocks `[feature]` completion again — the human always
   signs off on the version that ships to `step-implementer`.

**The marker:** `.claude/.scratch/approvals/feature.approved` (gitignored,
per-machine). Helper commands:

| Command | Effect |
|---|---|
| `bash .claude/hooks/bdd-approve-feature.sh` | record approval of the current features |
| `bash .claude/hooks/bdd-approve-feature.sh --status` | show digest + approval state (APPROVED / STALE / NOT APPROVED) |
| `bash .claude/hooks/bdd-approve-feature.sh --revoke` | drop the approval |

`bdd-feature-approval-lib.sh` is the shared digest/marker helper, sourced
by both `bdd-approve-feature.sh` and the `[feature]` branch of
`bdd-task-complete-guard.sh`.

**Lead checklist for a team run:** stay in `default` permission mode (do
not switch to `acceptEdits` — teammate `Write`/`Edit` and the shared-code
`ask` prompts must reach you). When `feature-author` reports done, show
the human `git diff`-equivalent of the feature file(s), get an explicit
answer, and only then run the approve script.

**If the hooks don't fire** after this session: the settings watcher only
watches `.claude/` if a settings file was there at session start. Open
`/hooks` once (reloads config) or restart Claude Code.

---

## Known limitations (from the docs — plan around these)

- **No `/resume` for in-process teammates.** After resuming a session the
  lead may message teammates that no longer exist — tell it to spawn new
  ones. The `SubagentStop` log is your record of what they concluded.
- **Task status can lag.** A teammate sometimes forgets to mark its task
  complete, blocking the dependent task. If a task looks stuck, check
  whether the work is actually done and nudge the lead / update it.
- **One team per session, no nested teams.** Teammates can't spawn their
  own teammates; only the lead manages the team.
- **The lead can stop early**, deciding the team is done before all tasks
  are. If it does: "keep going, not all tasks are complete."
- **Permissions are set at spawn** from the lead's mode; you can change a
  single teammate's mode afterward but not per-teammate at spawn time.

---

## When NOT to use the team

A single feature with no independent areas → just run the three skills
yourself in sequence (`gen-feature` → review → `write-step-defs` →
`add-logger` → `run-tests-triage`). The team earns its token cost when
the feature author and (later) the suite-runner overlap with other work,
or when you're authoring several **independent** capability areas that
teammates can own without touching the same files.

---

## Portability

Everything under `.claude/skills/` and `.claude/agents/` is
repo-agnostic — `cp -r .claude/skills .claude/agents .claude/hooks
other-repo/.claude/` and the team works there. Per-repo state
(`selmap.json`, `observations.json`, triage reports, run logs) lives in
`.claude/.scratch/` which is `.gitignore`d and never copied. Each skill
detects the target project's layout instead of assuming `src/…`.
