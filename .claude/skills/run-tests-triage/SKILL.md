---
name: run-tests-triage
description: Run a Playwright + Cucumber-BDD test suite and triage any failures — correlates each failure's error text and screenshot back to the specific page-object locator that most likely broke. Use when asked to "run the tests", "triage failures", "why did the suite fail", or after editing .feature/.steps.ts/.page.ts files. Report-only — never edits locators or source files.
---

# run-tests-triage — run the BDD suite, correlate failures to locators

The "app" in a Cucumber-BDD project is the suite itself: `*.feature` +
`*.steps.ts` + `*.page.ts`, driven by Playwright through the custom
World. There is no separate GUI to screenshot — the suite launches its
own browser per scenario. This skill runs the suite, captures a JSON
report, and triages failures. **Report-only — it never edits `*.page.ts`
or any source file.**

Repo-agnostic. The driver assumes nothing about directory names or the
`package.json` script name — it detects them (see Step 0).

## Step 0 — what the driver detects

`driver.mjs` figures out, from the project it runs in:

- **feature dir** — common parent of `**/*.feature`
- **steps dir** — common parent of `**/*.steps.{ts,js}`
- **support dir** — common parent of `**/{world,hooks}.{ts,js}`
- **TS vs JS** — whether the import globs contain `.ts` (→ needs the
  `tsx` loader)
- **run command** — the first `package.json` script whose body invokes
  `@cucumber/cucumber`; if none, falls back to
  `node --import tsx node_modules/@cucumber/cucumber/bin/cucumber.js`

Override any of the dirs with `--features-dir` / `--steps-dir` /
`--support-dir`; pass `--root <dir>` if not running from the project
root.

If there are **no `.feature` files**, the driver exits 2 with
`no .feature files found`.

## Run (agent path)

```
node .claude/skills/run-tests-triage/driver.mjs
```

This:
1. Detects the layout and run command, prints them, then runs cucumber
   with a `json:` formatter writing to
   `.claude/.scratch/run-tests-triage/cucumber-triage-report.json`
   (gitignored — never travels between repos).
2. If every scenario passes → prints
   `[triage] all N scenario(s) passed. Nothing to triage.` and exits 0.
3. If any scenario fails, for each one prints:
   - `Scenario:` name + `feature-file:line`
   - `Failed step:` text + line
   - `Step definition:` `file:line` (from the report's `match.location`)
   - `Error:` first line of the raw Playwright/Cucumber error
   - `Likely cause:` one of `selector drift`,
     `locator no longer unique`, `page-path drift`,
     `expected-text drift`, `network/site availability`, or
     `uncategorized`, with a one-line explanation
   - `Implicated source location(s):` every non-`node_modules`
     `…:line:col` frame from the stack trace — usually the exact locator
     line in the `*.page.ts` file
   - `Screenshot:` path under
     `.claude/.scratch/run-tests-triage/triage-screenshots/`, decoded
     from the `After` hook's embedded PNG if one was attached

Triage a subset with extra cucumber args after `--`:

```
node .claude/skills/run-tests-triage/driver.mjs -- --name "Signing in with valid credentials succeeds"
```

The driver never modifies project source. It only runs the suite and
writes under `.claude/.scratch/`.

The driver inherits `BROWSER` / `PARALLEL` from the environment — it does
not set them. Triage a single engine with `BROWSER=firefox node
.claude/skills/run-tests-triage/driver.mjs`, or serial with `PARALLEL=0`.
Default (unset) is chromium, `parallel: 2` from `cucumber.js`.

## Run (human path)

Run whatever `package.json` script the project uses for the BDD suite
(the driver's first log line names it, e.g. `npm run cucumberTs`). That
produces the project's own HTML/summary report; it has no JSON output
for automated triage, so use the driver path above when you want the
correlation.

## Gotchas

- **A bare `cucumber-js` on PATH usually won't work** for a TS project —
  step defs need the `tsx` loader and explicit `--import` globs. The
  driver builds the full working invocation itself rather than trusting a
  binary on PATH.
- **The suite hits a real site** (whatever the World's `baseUrl` points
  at). A failure may be a genuine site change, not a stale locator —
  that's why the driver classifies `network/site availability`
  separately from `selector drift`.
- **A single broken locator cascades.** `Before`/`After` re-launch the
  browser per scenario, so one bad selector fails *every* scenario that
  touches it — expect one triage entry per scenario, one root cause.
- **The screenshot is base64 inside the JSON report**, not a file on
  disk — it lives at `elements[].steps[].embeddings[].data` on the
  hidden `After` step. The driver decodes it to
  `.claude/.scratch/run-tests-triage/triage-screenshots/`.
- **Frames inside `node_modules`** are filtered out — only the project's
  own `…:line:col` frames are surfaced, since those are the ones you can
  act on.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `[driver] no report produced at …` | cucumber crashed before writing output (e.g. a syntax error in a step file) — re-run the exact command the driver printed to see the raw crash |
| `[driver] no .feature files found` | run from the project root, or pass `--root <dir>` |
| detected the wrong dir | pass `--features-dir` / `--steps-dir` / `--support-dir` explicitly |
| every scenario fails with the same "waiting for X" locator | that one locator broke — fix the single `*.page.ts` line the triage points at, not N separate bugs |

## Files

- `.claude/skills/run-tests-triage/SKILL.md` — this workflow
- `.claude/skills/run-tests-triage/driver.mjs` — runs the suite +
  triages (no browser of its own, no source edits). Portable — nothing
  repo-specific.
