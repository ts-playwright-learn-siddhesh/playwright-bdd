# write-step-defs — usage

Write runnable **Cucumber + Playwright step definitions** (TypeScript,
Page Object Model) from a `.feature` file **by driving the actual site**
to discover the real selectors and landing URLs. No guessed selectors, no
invented assertions.

`SKILL.md` is the authoritative spec (loaded by the agent). This README is
the short human-facing version.

## Inputs

1. **The `.feature` file** — gives the step-code structure (step
   expressions, params, data tables, Page Object methods). Parsed with
   `@cucumber/gherkin`.
2. **The live site** — driven via the `claude-in-chrome` browser tools to
   find the real field/submit selectors and the URLs pages land on.

Assertions in the generated steps come from the `.feature` text **as
written**. If the site disagrees, the test **fails** — that's the point.

## The two-mode driver

`scaffold.mjs` never opens a browser. The agent does the driving; the
script only emits code.

| Mode | What it does |
|---|---|
| `--plan FEATURE...` | prints JSON: every `When` action, its data-table field keys, the sample values to type, every page name used in a `Then`. Your to-do list for exploring the site. |
| `--emit FEATURE... --selmap S` | writes the suite from the `.feature` files + the `selmap.json` you produced. |

## How to run it

Ask in chat, e.g.:

- "write step definitions for `src/features/login.feature`"
- "scaffold the Cucumber + Playwright glue against `<url>`"
- `/write-step-defs`

The agent then: runs `--plan`, drives the site with the browser tools,
writes `selmap.json`, runs `--emit`, runs the suite.

### Prerequisites (one-time)

```bash
npm install
npx playwright install chromium
```

`@cucumber/cucumber@13`, `@playwright/test`, `tsx` are already dev-deps.
The `claude-in-chrome` MCP tools must be available.

## The flow, end to end

Paths use the `src/` layout as an example — pass `--features-dir` /
`--steps-dir` / `--support-dir` / `--pages-dir` for other layouts.

```bash
# 1. what to explore
node .claude/skills/write-step-defs/scaffold.mjs --plan <feature-dir>/login.feature --base-url <url>

# 2. agent drives the site with claude-in-chrome:
#    navigate <url> -> read_page -> read real id/name/data-test via javascript_tool
#    -> form_input the sample values -> click the real submit -> record location.href
#    -> tabs_close_mcp

# 3. write .claude/.scratch/write-step-defs/selmap.json  (shape below; per-repo, gitignored)

# 4. emit  (--selmap defaults to the scratch path above)
node .claude/skills/write-step-defs/scaffold.mjs --emit <feature-dir>/login.feature --base-url <url>

# 5. run  (whatever package.json script runs the BDD suite)
npm run cucumberTs -- --dry-run
npm run cucumberTs
```

## `selmap.json` shape

```json
{
  "pages": {
    "LoginPage": {
      "url": "/",
      "fields": {
        "user-name": "[data-test=\"username\"]",
        "password": "[data-test=\"password\"]"
      },
      "submit": {
        "theShopperSubmitsTheLoginForm": "[data-test=\"login-button\"]"
      }
    }
  },
  "pagePaths": { "login": "/", "inventory": "/inventory.html" }
}
```

- `pages.<PageClass>.fields` — one per data-table key → durable selector.
- `pages.<PageClass>.submit.<methodName>` — the action's submit control
  (method names come from `--plan`).
- `pages.<PageClass>.url` — where that Page Object's `open()` goes.
- `pagePaths` — each page name from `--plan` → the URL fragment observed.

Anything you leave out becomes a compile-visible `MISSING` marker in the
generated Page Object (never a guessed selector); the script lists it.

## Output — what is generated and where

Locations shown for the `src/` layout; with `--*-dir` flags they follow
those instead.

| File | Location | Committed? | Notes |
|---|---|---|---|
| `world.ts`, `hooks.ts` | support dir | Yes | Browser lifecycle + custom World. Created once. |
| `cucumber.js` / `cucumber.cjs` | repo root | Yes | Run profiles (`.cjs` when `package.json` is `"type": "module"`). Also sets a `cucumberTs` `package.json` script if one isn't already customised. |
| `base.page.ts`, `index.ts` | pages dir | Yes | Base + registry; `PAGE_PATHS` from `selmap.pagePaths` + observed URLs. |
| `<feature>.page.ts` | pages dir | Yes | Real selectors baked in from the selmap. Reused, not regenerated, if it already exists. |
| `<feature>.steps.ts` | steps dir | Yes | `async function` step defs; `Then` bodies assert the `.feature` verbatim. Not written if every step is already defined elsewhere. |
| `reports/cucumber-report.html` | `reports/` | No (gitignore) | HTML run report. |

## Run commands

Use whatever `package.json` script the project runs the BDD suite with —
`scaffold.mjs` names it `cucumberTs` if it created it:

```bash
npm run cucumberTs                       # whole suite
npm run cucumberTs -- --dry-run          # bind check: 0 undefined / 0 ambiguous
npm run cucumberTs -- --name "<name>"    # one scenario
npm run cucumberTs -- --profile ci       # retry + parallel + junit
```

> That script invokes
> `node --import tsx node_modules/@cucumber/cucumber/bin/cucumber.js`.
> Prefer that over `npx cucumber-js` (can resolve to a placeholder
> package).

## Pairs with `gen-feature`

`gen-feature` writes `.feature` files from observed app behaviour;
`write-step-defs` turns a `.feature` into runnable step code by
re-driving the site for selectors. Flow: `/gen-feature <url>` → review the
`.feature` → `/write-step-defs` → run.

## Files in this folder (all portable — copy the folder to any repo)

- `SKILL.md` — authoritative spec the agent follows
- `scaffold.mjs` — the `--plan` / `--emit` code emitter (no browser)
- `reference/step-def-standards.md` — Cucumber + Playwright SDET conventions
- `reference/selmap.example.json` — the selmap shape, for reference (never read by `--emit`)
- `README.md` — this file

The selector map you produce lives outside this folder, per repo:
`<project-root>/.claude/.scratch/write-step-defs/selmap.json` (gitignored,
the `scaffold.mjs` default).
