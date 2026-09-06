---
name: setup-cucumber-playwright
description: Project scaffolding for a Playwright + Cucumber-BDD (`@cucumber/cucumber`) + TypeScript suite — the setup step that runs BEFORE write-step-defs. Detects the target project's state (empty dir vs existing project, package manager, ESM vs CommonJS), then plans the dep install and writes only the config that must exist first — tsconfig.json, .gitignore, a GitHub Actions workflow. It does NOT write cucumber.js, the World, hooks, page objects, step defs, sample features, or the logger — those belong to write-step-defs / bdd-step-implementer / add-logger. Use when asked to "set up a cucumber playwright project", "scaffold a BDD project", "bootstrap cucumber + playwright + typescript", or "get the repo ready for write-step-defs".
---

# setup-cucumber-playwright — pre-`write-step-defs` project scaffolding

Runner: **`@cucumber/cucumber` (cucumber-js) driving Playwright**, executed
via `tsx`. This is the classic Cucumber track that the rest of this repo's
skills and agents target (`write-step-defs`, `run-tests-triage`,
`add-logger`; the `bdd-feature-author` / `bdd-step-implementer` /
`bdd-suite-runner` agents). It is **not** the `playwright-bdd` / `bddgen`
package.

Generic and repo-agnostic. **Detect first, then act.** The default
directory layout (`src/features/`, `src/step-definitions/`, `src/pages/`,
`src/support/`) matches `write-step-defs`' `scaffold.mjs` defaults — pass
`--features-dir` / `--steps-dir` / `--pages-dir` / `--support-dir` if the
target project uses something else, and pass the **same** dirs to
`scaffold.mjs` later.

## Scope — what this skill does and does not do

This skill only lays down what must exist **before** `write-step-defs` can
run. `write-step-defs` (`scaffold.mjs --emit`) then owns everything else.

| Written here | Owned by `write-step-defs` / others — NOT written here |
|---|---|
| `package.json` — complete, with dev-deps + placeholder scripts (skipped if one exists) | `cucumber.js` / `cucumber.cjs` |
| dep install **plan** (printed, not run) — includes `winston` + `@colors/colors` so `add-logger` needs no extra install | `src/support/world.ts`, `hooks.ts`, `data.ts` |
| `tsconfig.json` (skipped if one exists) | `*.feature`, `*.steps.ts`, `*.page.ts`, `base.page.ts`, `index.ts` |
| `.vscode/settings.json` — editor + `cucumberautocomplete.*` (skipped if one exists) | the real `package.json` `"cucumberTs"` / `"cucumberTs:ci"` scripts |
| `.vscode/extensions.json` — recommended extensions (skipped if one exists) | the winston logger module + World wiring → `add-logger` |
| `.gitignore` (append-merge) | |
| `.github/workflows/bdd.yml` (opt-out `--no-ci`) | |

`package.json`: written only when the project has **none**. It lists the
dev-deps (`@cucumber/cucumber`, `@playwright/test`, `@types/node`, `tsx`,
`typescript` pinned to **`next`** + `@typescript/native-preview` for the
**TypeScript 7** line, plus `winston` + `@colors/colors` for the later
`add-logger` step) so a plain `npm install` pulls them — no `npm init`.
Its `"cucumberTs"` script is a **placeholder that exits 1** until
`scaffold.mjs --emit` replaces it with the real one.

**TypeScript 7.** `typescript: "next"` resolves to the 7.x-dev compiler.
`@typescript/native-preview` adds the Go-native `tsgo` binary; the
`type-check` script is `tsgo --noEmit || tsc -p tsconfig.json --noEmit`.
The tsconfig is written for TS 7 (see Step 3) — `module`/`moduleResolution
nodenext`, `paths` instead of the removed `baseUrl`, no `node10` resolver.

`setup.mjs` never calls a package manager and never drives a browser. It
**plans** and **writes local config files**, then prints the exact install
and next-step commands — and **Claude then runs those printed commands**.

## How to run this skill

Invoking this skill **is** the instruction to complete the whole setup.
Run the workflow below straight through — detect, apply, install, verify —
in one pass. Do **not**:

- pause after `--plan` to ask "shall I apply?" — go on to `--apply`
- print the install commands and hand them back for the user to run —
  `setup.mjs` prints them because it can't call a package manager itself;
  **you** run them (`npm install`, or `npm i -D …` for an existing
  project, then `npx playwright install chromium`)
- ask which flags to use — default flags are correct for the detected
  state; only deviate if the user named a specific need (no CI, custom dir
  names, forced package manager)

Ask a question **only** when genuinely blocked: the target directory is
ambiguous and no `--dir` was given, a destructive `--force` overwrite of
existing user files would be needed, or a command needs interactive input
you can't supply (e.g. an auth login). Otherwise, choose the sensible
default and keep going. Report what was done at the end, not a running
prompt at each step.

## Workflow

### Step 1 — detect

```bash
node .claude/skills/setup-cucumber-playwright/setup.mjs --plan
```

Add `--dir <path>` if the target project is not the cwd. It reports:

- **state** — empty dir (fresh scaffold) / existing project / non-empty
  without `package.json`
- **package manager** — from `packageManager` field, else lockfile
  (`pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn, else npm)
- **modules** — ESM if `package.json` `"type": "module"`, else CommonJS
  (a fresh project is left at npm's CommonJS default; `scaffold.mjs`
  branches `cucumber.js` vs `cucumber.cjs` on this either way)
- **deps** — `@cucumber/cucumber`, `@playwright/test`, `@types/node`,
  `tsx`, `typescript` (+ `@typescript/native-preview`), `winston`,
  `@colors/colors` present or "will install"
- **package.json** — present (kept) or "will create"
- **tsconfig.json** — present (kept) or "will create"
- **.vscode/settings.json** / **.vscode/extensions.json** — present
  (kept) or "will create"
- **cucumber config / `world.ts`** — whether `write-step-defs` has already
  run here

Note the plan, then continue to Step 2 and Step 3 in the same pass — no
approval gate here.

### Step 2 — decide flags

| Need | Flag |
|---|---|
| No GitHub Actions workflow | `--no-ci` |
| Different dir names | `--features-dir` `--steps-dir` `--pages-dir` `--support-dir` |
| Force a package manager | `--pm npm\|pnpm\|yarn` |
| Re-run and overwrite this skill's files | `--force` |

TypeScript only — there is no `--js`; `write-step-defs` and the agents are
TS-only. `.gitignore` is append-merged, never rewritten. Files this skill
owns (`package.json`, `tsconfig.json`, `.vscode/settings.json`,
`.vscode/extensions.json`, the workflow) are skipped if they already exist
unless `--force`.

### Step 3 — apply

```bash
node .claude/skills/setup-cucumber-playwright/setup.mjs --apply [flags]
```

Writes, as needed:

- `package.json` — **only if the project has none.** `name` from the dir,
  `private`, `type: "commonjs"`, `scripts` (`test`, a placeholder
  `cucumberTs` that exits 1, `type-check` = `tsgo --noEmit || tsc -p
  tsconfig.json --noEmit`, `pw:install`), and `devDependencies` for
  `@cucumber/cucumber@13`, `@playwright/test`, `@types/node`,
  `@typescript/native-preview`, `tsx`, `typescript: "next"`, `winston`,
  `@colors/colors`. **Skipped if one exists.**
- `.vscode/settings.json` — only settings verified current:
  `editor.formatOnSave`, `files.eol`, `js/ts.tsdk.path`
  (`node_modules/typescript/lib` — points the editor at the workspace TS;
  VS Code marks the old `typescript.tsdk` key deprecated in favour of
  `js/ts.tsdk.path`),
  and the `cucumberautocomplete.*` keys confirmed in the extension's
  current README: `steps` (→ `--steps-dir`), `syncfeatures` (→
  `--features-dir`), `strictGherkinCompletion`, `strictGherkinValidation`,
  `smartSnippets`, `stepsInvariants`, `customParameters`, `pages`.
  **Deliberately omitted** (deprecated / discouraged / too opinionated for
  a scaffold): `typescript.enablePromptUseWorkspaceTsdk`,
  `editor.quickSuggestions` global override,
  `cucumberautocomplete.skipDocStringsFormat` / `.onTypeFormat` /
  `.pureTextSteps`. **Skipped if one exists.**
- `.vscode/extensions.json` — `recommendations`:
  `alexkrechik.cucumberautocomplete`, `ms-playwright.playwright`,
  `dbaeumer.vscode-eslint`, `esbenp.prettier-vscode`. **Skipped if one
  exists.**
- `tsconfig.json` — **written for TypeScript 7**: `target ES2022`,
  `module`/`moduleResolution` both `nodenext` (TS 7 removed the `node10`
  resolver; `tsx` runs the steps at runtime and resolves extensionless
  relative imports, so this only governs type-checking), `strict`,
  `types: ["node"]` (backed by the `@types/node` dep), `noEmit`, and
  `paths: {"*": ["./*"]}` — **not `baseUrl`**, which TS 7 removed
  (`TS5102`). `include` covers the steps / pages / support dirs. **Skipped
  if one exists** — review it by hand against those settings.
- `.github/workflows/bdd.yml` — checkout, setup-node, install,
  `playwright install --with-deps chromium`,
  `npm run cucumberTs -- --profile ci`, upload `reports/`. The `cucumberTs`
  script and the `ci` profile are created later by `scaffold.mjs --emit`,
  so this workflow only goes green once `write-step-defs` has run — that
  caveat is in a comment at the top of the file.
- `.gitignore` — appends `node_modules/`, `reports/`, `test-results/`,
  `playwright-report/`, `playwright/.cache/`, `.claude/.scratch/`, `logs/`

### Step 4 — run the printed install commands

`setup.mjs` prints them because it can't call a package manager itself.
**Run them yourself**, in the order printed — do not hand them back to the
user. Typically:

```bash
# fresh project — setup.mjs already wrote package.json with the dev-deps
npm install
npx playwright install chromium

# existing project that already has some of these
npm i -D @cucumber/cucumber@13 tsx @types/node winston   # whatever the plan flagged as MISSING
npx playwright install chromium
```

(Swap `npm i -D` → `pnpm add -D` / `yarn add -D` per detected manager.)
`npm i` / `playwright install` can take a few minutes — set a generous
timeout rather than assuming they hung.

### Step 5 — verify the scaffold

Run both, report the output:

```bash
npx tsc -p tsconfig.json --noEmit   # -p is required: bare `npx tsc` on TS 7 prints CLI help
npx playwright --version            # Playwright + browser present
```

Expected on a fresh scaffold: `error TS18003: No inputs were found` —
`src/step-definitions`, `src/pages`, `src/support` don't exist until
`write-step-defs` emits the suite. That means the tsconfig parsed fine;
it is **not** a failure. Any *other* tsc error (a removed option such as
`baseUrl`/`node10`, or `TS2688 Cannot find type definition file for
'node'` meaning `@types/node` didn't install) is a real problem — fix the
template or the install.

A green **Cucumber run** is not possible yet — there is no suite until
`write-step-defs` emits one. That's expected; don't treat it as a failure.

### Step 6 — hand off to `write-step-defs`

The suite itself — `cucumber.js`, `src/support/world.ts` + `hooks.ts` +
`data.ts`, `src/pages/*.page.ts`, `src/step-definitions/*.steps.ts`, the
`package.json` `"cucumberTs"` script — is generated by the
**`write-step-defs`** skill (or the **`bdd-step-implementer`** agent) from
a `.feature` file plus a live-site exploration:

```bash
node .claude/skills/write-step-defs/scaffold.mjs --plan <feature-file> --base-url <url>
# drive the site with the claude-in-chrome tools, write
# .claude/.scratch/write-step-defs/selmap.json, then:
node .claude/skills/write-step-defs/scaffold.mjs --emit <feature-file> --base-url <url> \
  --features-dir src/features --steps-dir src/step-definitions \
  --pages-dir src/pages --support-dir src/support
```

The `.feature` files come first — from the **`gen-feature`** skill or the
**`bdd-feature-author`** agent. Add the winston logger with **`add-logger`**
afterward (on a fresh scaffold: `write-step-defs` first so a World exists,
then `add-logger`).

See `.claude/TEAM-PLAYBOOK.md` for the full feature → steps → run pipeline.

## What this skill does NOT do

- `setup.mjs` itself does not call the package manager (it prints the
  commands) — but the skill run is not finished until **Claude** has run
  those commands and the Step 5 verification
- Does not write `cucumber.js`, the World, hooks, page objects, step
  definitions, sample features, or the logger — that's `write-step-defs` /
  `add-logger` / `gen-feature`
- Does not overwrite an **existing** `package.json`, `tsconfig.json`,
  `.vscode/settings.json`, `.vscode/extensions.json`, or CI workflow (all
  `--force`-able). The `package.json` it writes for a fresh project
  carries only a **placeholder** `"cucumberTs"` — `scaffold.mjs --emit`
  replaces it with the real script and adds `"cucumberTs:ci"`
- Does not write the winston logger module or wire it into the World —
  that's `add-logger`. This skill only pre-installs `winston` +
  `@colors/colors` so `add-logger` needs no separate install step.
- Does not drive a browser or discover selectors — that's `write-step-defs`
  / the `bdd-step-implementer` agent
