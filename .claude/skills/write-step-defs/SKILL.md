---
name: write-step-defs
description: Write runnable Cucumber + Playwright step definitions (TypeScript, Page Object Model) from a .feature file by driving the ACTUAL site with the claude-in-chrome browser tools to discover the real selectors and landing URLs — no guessed selectors, no invented assertions. Also lays down the World, hooks, and cucumber.js profile. Use when asked to "write step definitions", "implement the steps", "wire up cucumber steps", "scaffold the BDD glue", "generate step defs", or to turn a .feature file into runnable step code.
---

# write-step-defs — step definitions from the real site + the .feature file

Inputs: **the `.feature` file** and **the live site** (driven via the
`claude-in-chrome` MCP tools). Nothing else — no `observations.json`, no
guessed selectors.

Repo-agnostic. The walkthrough below uses `src/features/`,
`src/support/world.ts`, `https://www.saucedemo.com`, etc. as **one
concrete example run** — `scaffold.mjs` takes `--features-dir` /
`--steps-dir` / `--pages-dir` / `--support-dir` and defaults to the `src/`
layout only because that is the most common one. Point them at whatever
the target project actually uses. The selector map you produce goes in
the **per-repo gitignored scratch area**, not this skill folder, so the
folder stays copy-pasteable:
`<project-root>/.claude/.scratch/write-step-defs/selmap.json` (the
`scaffold.mjs` default).

- The **structure** of the step code (step expressions, params, data-table
  handling, Page Object methods) comes from parsing the `.feature` with
  `@cucumber/gherkin`.
- The **locators** and the **page URLs** come from you actually opening
  the site, filling each form, clicking submit, and recording what worked.
  Record a **user-facing locator** (`getByRole` / `getByLabel` /
  `getByPlaceholder` / `getByText` / `getByTestId`) — a raw CSS/XPath
  string is a last resort, only when the markup exposes no such handle.
- The **assertions** are generated from the `.feature` text **as written**.
  If the site does something different, the test **fails** — that is the
  signal, not something to paper over.

`scaffold.mjs` never touches a browser. It has two modes: `--plan` (tells
you what to go explore) and `--emit` (writes the suite from the
`.feature` + the `selmap.json` you produced).

Paths in commands below are relative to the project root. Run from there,
or adjust.

## Step 0 — detect the layout

Before the first `--plan`, confirm the target project's directories:

- glob `**/*.feature` → the feature dir (common parent). If none exist
  yet, the `src/features/` default is fine when `src/` exists, else
  `features/`.
- glob `**/*.steps.ts`, `**/{world,hooks}.ts`, `**/*.page.ts` → steps /
  support / pages dirs. On a **fresh** scaffold these won't exist yet —
  `scaffold.mjs --emit` creates them under the `src/` defaults unless you
  pass `--steps-dir` / `--support-dir` / `--pages-dir`.
- read `package.json` `"type"` (ESM vs CJS — `scaffold.mjs` already
  branches `cucumber.js` vs `cucumber.cjs` on this) and note which script
  runs the suite.

Pass the non-default dirs on **every** `scaffold.mjs` call.

## Prerequisites (one-time)

```bash
npm install
npm install -D @faker-js/faker   # unique run-time test data (see "Unique test data" below)
npx playwright install chromium
```

`@cucumber/cucumber@13`, `@playwright/test`, `tsx` are already dev-deps.
`@faker-js/faker` is added on first use — `scaffold.mjs --emit` writes
`src/support/data.ts`, which imports it. The `claude-in-chrome` MCP tools
must be available (they are in this environment).

## Workflow

### Step 1 — get the exploration plan

```bash
node .claude/skills/write-step-defs/scaffold.mjs --plan src/features/login.feature --base-url https://www.saucedemo.com
```

Prints JSON: per feature, every distinct `When` **action**, its
data-table **field keys**, the **sample values** to type (resolved from
`Examples` for outlines), and every **page name** used in a `Then`.
Verified this session for `login.feature`:

```json
{
  "baseUrl": "https://www.saucedemo.com",
  "features": [{
    "pageClass": "LoginPage", "pageProp": "login",
    "actions": [{
      "method": "theShopperSubmitsTheLoginForm",
      "fields": ["user-name", "password"],
      "sampleValues": { "user-name": "standard_user", "password": "secret_sauce" }
    }],
    "pageNames": ["inventory", "login"]
  }],
  "selmapShape": { "...": "the shape your selmap.json must have" }
}
```

### Step 2 — drive the real site with the claude-in-chrome tools

For each feature in the plan:

1. `mcp__claude-in-chrome__tabs_context_mcp` `{ createIfEmpty: true }`,
   then `mcp__claude-in-chrome__navigate` to `baseUrl`.
2. `mcp__claude-in-chrome__read_page` `{ filter: "interactive" }` to see
   the fields, and `mcp__claude-in-chrome__javascript_tool` to read what a
   **user-facing locator** would key on — the accessible role + name, the
   associated `<label>` text, the `placeholder`, and any test-id attribute
   — for each input and the submit control:
   ```
   [...document.querySelectorAll('input,select,textarea,button,a')].map(e => ({
     tag: e.tagName, type: e.type, role: e.getAttribute('role'),
     name: e.name, id: e.id,
     label: e.labels && e.labels[0] && e.labels[0].textContent.trim(),
     placeholder: e.placeholder, ariaLabel: e.getAttribute('aria-label'),
     text: e.textContent.trim().slice(0, 40),
     dataTestId: e.getAttribute('data-testid') || e.getAttribute('data-test') || e.getAttribute('data-qa'),
   }))
   ```
   Pick, per field, the **first** that uniquely identifies it:
   `getByRole` (button / link / checkbox / radio / combobox with an
   accessible name) → `getByLabel` → `getByPlaceholder` → `getByText`
   (links / static controls) → `getByTestId` → raw CSS. If the test-id
   attribute is not `data-testid` (e.g. `data-qa`, `data-test`), note it
   for `selmap.testIdAttribute`.
3. For each action: `mcp__claude-in-chrome__form_input` the sample values
   into each field ref, click the real submit
   (`mcp__claude-in-chrome__computer` `left_click` on its ref or
   coordinate — a raw `.value=` set will not fire a framework's onChange),
   then read `location.href` and any visible message. Record the landing
   URL for `pagePaths`.
4. Close the tab with `mcp__claude-in-chrome__tabs_close_mcp`.

Verified against `https://www.saucedemo.com`: the username/password inputs
carry only `placeholder` ("Username" / "Password"), so
`{ "placeholder": "Username" }` / `{ "placeholder": "Password" }`; the
submit is `{ "role": "button", "name": "Login" }`; valid login lands on
`/inventory.html`, blank submit stays on `/`.

### Step 3 — write `selmap.json`

Put it at `.claude/.scratch/write-step-defs/selmap.json` (create the
directory if missing — it's gitignored per-repo scratch, and it's the
`scaffold.mjs` default so `--emit` needs no `--selmap` flag). Shape:

```json
{
  "testIdAttribute": "data-qa",
  "pages": {
    "LoginPage": {
      "url": "/",
      "fields": {
        "user-name": { "placeholder": "Username" },
        "password":  { "label": "Password" },
        "otp":       { "testId": "otp-code" },
        "legacy":    ".no-a11y-hook"
      },
      "submit": {
        "theShopperSubmitsTheLoginForm": { "role": "button", "name": "Login" }
      }
    }
  },
  "pagePaths": { "login": "/", "inventory": "/inventory.html" }
}
```

- `testIdAttribute` — **optional, top level.** Set it only when the site's
  test-id attribute is not `data-testid` (e.g. `data-qa`, `data-test`);
  `--emit` then calls `selectors.setTestIdAttribute(...)` in `world.ts` so
  every `getByTestId` resolves. Omit otherwise.
- `pages.<PageClass>.fields` — one entry per data-table key. The value is a
  **locator spec**:

  | spec | generates |
  |---|---|
  | `{ "role": "button", "name": "Sign up" }` | `getByRole('button', { name: 'Sign up' })` |
  | `{ "label": "Password" }` | `getByLabel('Password')` |
  | `{ "placeholder": "Email Address" }` | `getByPlaceholder('Email Address')` |
  | `{ "text": "Continue" }` | `getByText('Continue')` |
  | `{ "altText": "logo" }` / `{ "title": "…" }` | `getByAltText` / `getByTitle` |
  | `{ "testId": "signup-email" }` | `getByTestId('signup-email')` |
  | `"any css string"` or `{ "css": "…" }` / `{ "xpath": "…" }` | `page.locator('…')` — **last resort** |

  Optional refiners on any object spec: `"exact": true`,
  `"nth": 0 | "first" | "last"`, `"filterText": "…"` (→ `.filter({ hasText })`).
  Reach for a raw CSS/XPath string only when the element has no role,
  label, placeholder, visible text, or test-id to key on.
- `pages.<PageClass>.submit.<methodName>` — the submit control for that
  action (same locator-spec shape; method names are in the plan).
- `pages.<PageClass>.url` — where that Page Object's `open()` should go.
- `pagePaths` — every page name from the plan → the URL fragment you
  observed it lands on.

### Step 4 — emit the suite

```bash
# --selmap defaults to .claude/.scratch/write-step-defs/selmap.json, so:
node .claude/skills/write-step-defs/scaffold.mjs --emit src/features/login.feature \
  --base-url https://www.saucedemo.com
# add --features-dir/--steps-dir/--support-dir/--pages-dir if the project
# doesn't use the src/ layout.
```

Example output (a real run against saucedemo):

```
scaffold.mjs --emit — done

  written                    src\support\world.ts
  written                    src\support\hooks.ts
  written                    cucumber.js
  written                    src\pages\base.page.ts
  written                    src\pages\index.ts
  scripts.cucumberTs updated package.json
  written                    src\pages\login.page.ts
  written                    src\step-definitions\login.steps.ts
```

The generated `LoginPage` has the real locators baked in — user-facing
where the markup allowed, no `// TODO`:

```ts
private readonly fUserName: Locator = this.page.getByPlaceholder("Username");
private readonly fPassword: Locator = this.page.getByLabel("Password");

async theShopperSubmitsTheLoginForm(fields: Record<string, string>): Promise<void> {
  if ("user-name" in fields) await this.fUserName.fill(fields["user-name"]);
  if ("password" in fields) await this.fPassword.fill(fields["password"]);
  await this.page.getByRole("button", { name: "Login" }).click();
}
```

If a locator is missing from `selmap.json`, that spot gets a `MISSING`
marker (not a guess) and the script lists it: explore it, add it, delete
the affected `*.page.ts`, re-run `--emit`.

### Step 5 — run

```bash
npm run cucumberTs -- --dry-run     # 0 undefined / 0 ambiguous
npm run cucumberTs                  # real browser against the site
```

Verified this session — all `login.feature` scenarios green:

```
2 hooks (2 passed)
5 scenarios (5 passed)
29 steps (29 passed)
```

HTML report at `reports/cucumber-report.html`. One scenario:
`-- --name "<name>"`. CI profile (retry + parallel + junit):
`-- --profile ci`.

### Step 6 — confirm the fail-on-disagreement contract

A `.feature` that asserts something the real site doesn't do **must
fail**. Verified this session: a throwaway scenario asserting a message
saucedemo never shows →

```
1 scenario (1 failed)
5 steps (4 passed, 1 failed)
```

The `After` hook attaches a full-page PNG on any failure.

## What gets generated

| File | Created when | Contents |
|---|---|---|
| `src/support/world.ts` | absent | `PlaywrightWorld` — browser/context/page/pages, `baseUrl`, `BROWSER`/`HEADED` env switches, `init()`/`destroy()` |
| `src/support/hooks.ts` | absent | 60s timeout, `Before`→init, `After`→screenshot-on-fail + teardown |
| `src/support/data.ts` | absent | `uniqueEmail(seed?)` + `personName()` — faker-backed, so a hard-coded unique-by-nature value in a `.feature` (registration e-mail, username…) is swapped for a fresh one at run time and re-runs stay green |
| `cucumber.js` | absent | `default` + `ci` profiles |
| `src/pages/base.page.ts` | absent | `BasePage` (`open`, `expectPage`, `expectText`) + `PAGE_PATHS` (from `selmap.pagePaths` + observed URLs) |
| `src/pages/index.ts` | absent | Page Object registry `buildPageObjects(page, baseUrl)` |
| `src/pages/<feature>.page.ts` | per feature, if absent | one class per feature; `private readonly` Locators from `selmap`; one `async` method per `When` action, filling exact data-table keys and clicking the real submit |
| `src/step-definitions/<feature>.steps.ts` | per feature, unless every step is already defined | `async function` step defs (not arrow); `When` bodies delegate to the Page Object; `Then` bodies assert the `.feature` text verbatim |

## Gotchas

- **`--emit` requires `--selmap`.** Run `--plan` first, explore, write
  `selmap.json`, then `--emit`.
- **Assertions are NOT verified against the site at scaffold time.** They
  come from the `.feature`. A wrong expectation surfaces as a failing run
  in Step 5, by design.
- **`MISSING` markers, never guessed selectors.** A field or submit not in
  `selmap.json` — or a locator spec with no recognised key — produces a
  compile-visible `MISSING` comment + a console line. Fill the gap and
  re-emit.
- **Prefer user-facing locators.** A locator spec should be
  `{ role, name }` / `{ label }` / `{ placeholder }` / `{ text }` /
  `{ testId }`; a raw CSS/XPath string is the fallback for elements with no
  such handle. See the locator-spec table in Step 3.
- **Raw `el.value = …` in the MCP JS tool doesn't fire onChange** on
  React/Vue sites — the form still sees empty fields. Use
  `form_input` + a real click while exploring; the generated code uses
  Playwright `.fill()` which dispatches proper events.
- **Existing files are never overwritten.** `world.ts`, `cucumber.js`, a
  hand-edited `*.page.ts`, etc. are left untouched (reported as
  `exists — left untouched`). To regenerate one, delete it first.
- **Steps files are per-feature; step *definitions* are global.** A step
  phrased identically in two features is defined once — the script scans
  `step-definitions/` and skips duplicates (Cucumber errors on ambiguous
  defs). Phrase shared actions identically across features.
- **`@cucumber/pretty-formatter` is not wired in** — v4 is ESM-only and
  `@cucumber/cucumber@13` fails to load it as a format target. `cucumber.js`
  uses built-in `summary` + `progress-bar` + `html`.
- **`progress-bar` needs a TTY** — non-interactive runs print
  `Switching to 'progress' formatter` (informational).
- **`index.ts` is written once.** A feature added later isn't auto-added to
  the registry — add the two lines by hand or delete `index.ts` and
  re-emit all features.
- **Not a git repo.** No safety net — `--dry-run` on `--emit` first if
  unsure.
- **Hard-coded unique values in a `.feature` fail on the 2nd run.** A
  registration e-mail / username / reference the site rejects as "already
  exists". Don't submit it verbatim: in the `When` step, resolve it through
  `uniqueEmail()` from `src/support/data.ts` and stash the result on the
  World (`this.lastSignupEmail`) for later steps. A blank cell stays blank.
  See `reference/step-def-standards.md` §4 "Unique test data".
- **A scenario that needs a value that already exists** (a "duplicate
  e-mail is rejected" case) can't be satisfied by uniquifying. Add a
  **name-scoped** `Before` in `src/support/<feature>.hooks.ts`:
  `Before({ name: 'exact scenario name' }, async function () { … })` that
  creates the record through the real UI and pins it
  (`this.forcedSignupEmail = …`); the signup step submits that verbatim.
  This file loads after `hooks.ts` (so `this.init()` has run) because
  `hooks.ts` sorts before `<feature>.hooks.ts`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `pass --plan or --emit` | you ran it with neither mode flag |
| `cannot read selmap at …` | run `--plan`, drive the site, write the selmap (default `.claude/.scratch/write-step-defs/selmap.json`) |
| `Gherkin parse failed` | fix `.feature` syntax (2-space indent, one `Background`, `Examples` under every outline) |
| Page Object has `MISSING selector` | that field/submit isn't in the selmap — explore it, add it, delete the `*.page.ts`, re-emit |
| `Ambiguous scenarios` at run | a step is defined twice — delete the duplicate; the registry catches it next emit |
| `this.page is undefined` in a step | step body is an arrow function — must be `async function (this: PlaywrightWorld, …)` |
| scenario fails on a `Then` you expected to pass | the `.feature`'s expectation doesn't match the real site — fix the feature or the app |
| green on 1st run, fails on 2nd with "already exists" | a hard-coded unique value is submitted verbatim — route it through `uniqueEmail()` in the `When` step (see Gotchas) |
| `Cannot find module '@faker-js/faker'` | `npm install -D @faker-js/faker` |
| `Executable doesn't exist … chromium` | `npx playwright install chromium` |

## Runs alongside `add-logger`?

If the same piece of work also adds logging: on a **fresh** scaffold, run
**`write-step-defs` first** (it creates the World + hooks), then
`add-logger` **second** — running `add-logger` against a repo with no
World forces its degraded "no World detected" fallback. On an
**established** project where the World already exists, order doesn't
matter. Both skills touch `world.ts` / `hooks.ts`, so run one to
completion before starting the other; don't interleave.

## Files (all portable — copy the folder to any repo)

- `.claude/skills/write-step-defs/scaffold.mjs` — `--plan` / `--emit` code emitter (no browser); also writes `data.ts`
- `.claude/skills/write-step-defs/reference/step-def-standards.md` — the Cucumber + Playwright SDET conventions (§4 covers unique test data)
- `.claude/skills/write-step-defs/reference/selmap.example.json` — the `selmap.json` shape, as a reference (never read by `--emit`)

The selector map you produce lives **outside** the skill folder, per
repo: `<project-root>/.claude/.scratch/write-step-defs/selmap.json`
(gitignored, the `scaffold.mjs` default).
