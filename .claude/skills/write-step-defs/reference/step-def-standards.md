# Step-definition standards — Cucumber + Playwright (SDET)

The conventions `scaffold.mjs --emit` generates to, and that any
hand-written or hand-completed step code in this repo must follow.
Distilled from the Cucumber docs (cucumber.io/docs/gherkin/step-definitions,
cucumber.io/docs/cucumber/api) and current Playwright + Cucumber SDET
practice (2025–2026).

**How locators get here:** the agent runs `scaffold.mjs --plan`, drives
the real site with the `claude-in-chrome` MCP tools, and writes the
discovered **locator specs** + landing URLs to `selmap.json`. `--emit`
bakes those into the Page Objects. A locator spec is a small object that
picks a **user-facing** Playwright locator — `{ role, name }` →
`getByRole`, `{ label }` → `getByLabel`, `{ placeholder }` →
`getByPlaceholder`, `{ text }` → `getByText`, `{ testId }` →
`getByTestId` — with a raw CSS/XPath string only as a last resort when the
element has no such handle. Set `selmap.testIdAttribute` when the site's
test-id attr is not `data-testid`. No locator is ever guessed — a gap
becomes a `MISSING` marker. Assertions are generated from the `.feature`
text as written; a site that disagrees fails the run.

---

## 1. Layout

```
src/
  features/            <name>.feature            (Gherkin — the spec)
  step-definitions/    <name>.steps.ts           (glue — one per feature, minus shared steps)
  pages/               base.page.ts              (shared navigation + assertions)
                       index.ts                  (Page Object registry -> World)
                       <name>.page.ts            (one Page Object per feature surface)
  support/
    world.ts           custom World: browser / context / page / pages, baseUrl
    hooks.ts           BeforeAll / Before(init) / After(screenshot-on-fail + destroy) / AfterAll
cucumber.js            profiles: default + ci (paths, import globs, formatters)
```

Run with `npm run cucumberTs` (reads `cucumber.js`). A single scenario:
`npm run cucumberTs -- --name "Sign in with valid credentials"`.
CI profile (retry + parallel + junit): `npm run cucumberTs -- --profile ci`.

> On Windows / Git Bash always invoke via
> `node --import tsx node_modules/@cucumber/cucumber/bin/cucumber.js …`.
> **Never `npx cucumber-js`** — it resolves to a placeholder package here.

---

## 2. The World (`support/world.ts`)

- One `PlaywrightWorld` instance **per scenario** — total isolation.
- Holds `browser`, `context`, `page`, and `pages` (the Page Object
  registry), plus a read-only `baseUrl` (`process.env.BASE_URL` wins, else
  the value baked in at scaffold time).
- `BROWSER=firefox|webkit` switches engine; `HEADED=1` shows the browser.
- `init()` launches + opens a context/page and builds the Page Objects;
  `destroy()` closes everything. Both are called from hooks, never a step.
- `setWorldConstructor(PlaywrightWorld)` at the bottom.

## 3. Hooks (`support/hooks.ts`, `support/<feature>.hooks.ts`)

- `setDefaultTimeout(60_000)` — UI is slower than Cucumber's 5s default.
- `Before` → `this.init()`. `After` → on `Status.FAILED`, `this.attach(png)`
  a full-page screenshot, then `this.destroy()` **always**.
- Tag-scoped hooks when needed: `Before({ tags: '@auth' }, …)`.
  Name-scoped for a one-scenario precondition:
  `Before({ name: 'exact scenario name' }, …)`.
- No `When`/`Then` logic in hooks. Setup/teardown only — the **one**
  allowed exception is a precondition hook that must create data the
  feature depends on but never creates itself (see §4, "Unique test
  data"); keep it in `support/<feature>.hooks.ts`, not `hooks.ts`.

---

## 4. Step definitions — the rules

### `async function`, never an arrow
Cucumber binds the World to `this`. `Given('…', async () => {})` breaks
`this.page`. Always `async function (this: PlaywrightWorld, …) {}`.

### One step definition per step, globally — no duplicates
Cucumber **errors on ambiguous step definitions**. A step phrased
identically in two features is defined **once** and shared. `scaffold.mjs`
keeps a registry of every `Given/When/Then('…')` already in
`step-definitions/` and refuses to re-emit one; if a feature's steps are
all already defined, no steps file is written for it. Consequence: phrase
shared actions **identically** across features ("the shopper signs in",
not "signs in" here and "logs in" there).

### Steps delegate to a Page Object — no selectors in steps
A step body is one to three lines: call `this.pages.<name>.<method>(…)`
and/or assert. Locators, `.click()`, `.fill()`, waits → the Page Object.
This keeps `.feature` + `.steps.ts` stable across UI changes.

**Bad**
```ts
When('the shopper signs in', async function (this: PlaywrightWorld) {
  await this.page.locator('#user-name').fill('standard_user');
  await this.page.locator('.btn_action').click();
});
```
**Good**
```ts
When('the shopper submits the login form:', async function (this: PlaywrightWorld, table: DataTable) {
  await this.pages.login.submitLoginForm(Object.fromEntries(table.raw()));
});
```

### Cucumber-expression params map to typed args
`{string}` → `string`, `{int}` → `number`, in order. `<placeholders>` from
a `Scenario Outline` are substituted **before** matching, so a step with
`"<username>"` is matched as `{string}`. Prefer cucumber expressions over
regex; reach for `defineParameterType` only for a real domain type.

### Data tables
- A `When` that submits a form carries a **field-keyed data table**
  (`| name | value |`). In the step: `Object.fromEntries(table.raw())`
  → `Record<string,string>`, hand straight to the Page Object method.
  Blank cell → empty string → the Page Object skips or clears that field.
- `table.hashes()` for a list-of-rows-with-headers; `table.rows()` for
  body rows without the header.

### `Then` asserts observable output only
`expect` from `@playwright/test`. Assert what the user sees — URL,
visible text, element state — never a DB row. Web-first assertions
(`toHaveURL`, `toBeVisible`) auto-wait; don't add `waitForTimeout`.
Page names map to URL fragments in `PAGE_PATHS` (`base.page.ts`) — one
entry per page name used in the features, filled from the URLs the agent
observed on the live site (`selmap.pagePaths`). The generated `Then`
bodies assert the `.feature` text **verbatim**: `reaches "<x>" page` →
`expectPage("<x>")`, `message "<t>" is shown` → `expectText("<t>")`. If the
real site shows different text or lands on a different URL, that `Then`
fails — fix the `.feature` or the app, never the assertion to match a bug.

### One behaviour per step; `And`/`But` continue the block
No "log in **and** add to cart" in a single step. `And`/`But` inherit the
prior keyword's category (a `Then … And …` is two assertions).

### No return values between steps; share via `this`
State a scenario needs across steps lives on the World (`this.lastOrderId`
etc.), set in a `When`, read in a `Then`. Never rely on module scope —
that leaks between scenarios.

### Unique test data — never let a hard-coded value collide on re-run
`@faker-js/faker` is a dev dependency. Any field whose value must be
**globally unique for the run to succeed** — a registration e-mail, a
username, an order reference — must not be submitted verbatim from the
`.feature`. The `.feature` is still the spec; the step code just swaps the
literal for a fresh value at run time:

- `support/data.ts` exports `uniqueEmail(seed?)` (keeps the seed's
  readable local-part, appends a `Date.now()`-+-faker token as an extra
  dotted segment) and `personName()`. `--emit` writes this file when
  absent.
- A `When` that submits such a form resolves the value in the **step
  definition** (not the Page Object) and passes it down:
  ```ts
  if ('email' in fields && fields.email.trim() !== '') {
    fields.email = this.forcedSignupEmail ?? uniqueEmail(fields.email);
  }
  this.lastSignupEmail = fields.email;
  ```
  A blank cell is left blank (blank-field scenarios still test what they
  should). The resolved value goes on the World (`this.lastSignupEmail`)
  so later steps (login, delete) reuse it.
- A scenario that specifically needs a value that **already exists**
  (a "duplicate e-mail is rejected" case) gets a **name-scoped `Before`
  hook** in `support/<feature>.hooks.ts` that creates the record through
  the real UI and pins its value on the World
  (`this.forcedSignupEmail = …`); the signup step then submits that exact
  value. This hook is the one legitimate place to drive the site outside a
  step. It runs after `hooks.ts`'s `Before` (`init()`), which is
  guaranteed by file load order (`hooks.ts` < `<feature>.hooks.ts`).

This is not "changing the assertion to hide a bug" — the site genuinely
does reject a re-used e-mail; the test just stops depending on a
first-run-only precondition.

---

## 5. Page Objects (`pages/*.page.ts`)

- One class per **feature surface**, extending `BasePage` (which holds
  `open()`, `expectPage()`, `expectText()`).
- Constructor takes `(page: Page, baseUrl: string)` — supplied by
  `buildPageObjects` in `index.ts`, which the World calls in `init()`.
- `private readonly` Locator fields at the top, **built from the locator
  specs the agent captured on the live site**
  (`selmap.pages.<Class>.fields`); one `async` method per distinct `When`
  action, filling the exact data-table keys and clicking the real submit
  control (`selmap.pages.<Class>.submit.<method>`). Methods return
  `Promise<void>` unless returning a value the scenario asserts on.
- **Prefer user-facing locators.** Each spec should resolve to
  `getByRole` / `getByLabel` / `getByPlaceholder` / `getByText` /
  `getByTestId`; `page.locator(<css/xpath>)` is emitted only for a bare
  string spec, i.e. an element with no accessible role/label/placeholder/
  text/test-id. This survives styling and DOM-structure churn.
- **No guessed selectors.** A field or submit not in `selmap.json` — or a
  spec object with no recognised key — is emitted as a
  `// MISSING selector …` comment, never a placeholder that might
  accidentally match. `--emit` prints every gap. Explore it, add it to
  `selmap.json`, delete the affected `*.page.ts`, re-run `--emit`.
- **Reuse:** if `<name>.page.ts` already exists, `--emit` does not
  overwrite it. Add new methods to the existing class by hand; to fully
  regenerate one from an updated `selmap.json`, delete it first.
- A new Page Object needs a matching entry in `pages/index.ts`
  (`PageObjects` interface + `buildPageObjects`). `--emit` writes
  `index.ts` only when absent — for a feature added later, add the two
  lines by hand or delete `index.ts` and re-emit all features.

---

## 6. Tags

- Capability tag on `Feature:` (`@login`, `@checkout`) — carries to every
  scenario. Cross-cutting tags on scenarios (`@smoke`, `@negative`,
  `@boundary`, `@security`, `@slow`, `@wip`).
- Select at run time: `npm run cucumberTs -- --tags "@login and not @wip"`.
- Scope a hook to a tag: `Before({ tags: '@auth' }, async function () {…})`.

---

## 7. Definition of done for a completed step file

- `npm run cucumberTs -- --dry-run` → **0 undefined, 0 ambiguous**.
- No `MISSING selector` marker left in any `*.page.ts`; no `// TODO` in
  the steps files.
- No hard-coded unique-by-nature value (registration e-mail, username,
  reference number) submitted verbatim from a `.feature` — routed through
  `uniqueEmail()` / a `personName()` etc. so a second `npm run cucumberTs`
  is as green as the first.
- Each Page Object locator is a real locator captured from the site, and
  **user-facing by default** — `getByRole` / `getByLabel` /
  `getByPlaceholder` / `getByText` / `getByTestId`. A raw
  `page.locator(<css/xpath>)` appears only where the element genuinely has
  no such handle (and is flagged in review).
- `npm run cucumberTs` → the scenarios pass against the real app; a
  scenario whose `.feature` expectation is wrong **fails** (don't loosen
  the assertion to hide it).
- A forced failure attaches a screenshot (the `After` hook works).

---

## Sources
- https://cucumber.io/docs/gherkin/step-definitions/
- https://cucumber.io/docs/cucumber/api/?lang=javascript
- https://cucumber.io/docs/cucumber/configuration/
- https://playwright.dev/docs/best-practices
- https://playwright.dev/docs/test-assertions
- https://www.browserstack.com/guide/playwright-cucumber
