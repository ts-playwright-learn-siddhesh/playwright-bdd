---
name: gen-feature
description: Generate Cucumber .feature files (Gherkin) by driving a live web app or URL with the claude-in-chrome browser tools — submitting its forms with real inputs, recording the REAL responses, and writing scenarios only from what was observed. Use when asked to "generate a feature file", "write Gherkin", "create BDD scenarios", "scaffold cucumber features", or "turn this app/URL into feature files".
---

# gen-feature — generate Cucumber feature files from OBSERVED app behaviour

Turn a **live web app** into declarative Gherkin `.feature` files whose
every scenario is backed by a **real, observed response** — never an
assumption.

**You (the agent) drive the site with the `claude-in-chrome` MCP tools.**
There is no crawler script. You navigate, you submit forms, you read what
the app actually did, you write that down, and only then do you write
`.feature` files from it.

**Hard rule:** if a behaviour was not observed in this session, it does
not go in a feature file. No guessing, no `@speculative`.

Repo-agnostic: this skill assumes nothing about the target project's
layout. It **detects** where `.feature` files go and where the scratch
record lives — see Step 0.

## Prerequisites

The `claude-in-chrome` MCP tools must be available (they are in this
environment). Nothing to `npm install` for the exploration itself;
`@cucumber/cucumber` is only needed for the optional Step 5 dry-run.

## Workflow

### Step 0 — detect where things go

1. **Feature output dir:** glob `**/*.feature` (prune `node_modules`,
   `.git`, `dist`, `build`, `reports`). Their common parent is the
   feature dir — write new `.feature` files there. If there are **no**
   `.feature` files yet, fall back to `src/features/` **only if** a
   `src/` directory exists, else `features/`; state which you chose and
   why.
2. **Scratch record:** the working notes go at
   `<project-root>/.claude/.scratch/gen-feature/observations.json`
   (gitignored — never a deliverable, regenerated each run). Create the
   `.claude/.scratch/gen-feature/` directory if missing.

State back the feature dir you'll write to before you start driving the
site.

### Step 1 — understand the target and the ask

From the user's request, fix:

- **Start URL** (e.g. `https://automationexercise.com/`).
- **Which capability / page** they want covered (e.g. "the registration
  page", "the contact form", "login"). If they said "the whole site",
  pick the forms reachable within one or two link hops and list them back.
- **Whether reaching it changes state** (signup, checkout, payment,
  profile edit, delete). Those really create accounts / place orders on
  the target. **Ask the user before submitting a state-changing form**,
  name what it will do, and only proceed on an explicit yes. A public
  demo site built for testing (saucedemo, automationexercise) is normally
  fine with the user's ok; a real product is not.

### Step 2 — drive the site with claude-in-chrome

1. `mcp__claude-in-chrome__tabs_context_mcp` `{ createIfEmpty: true }`,
   then `mcp__claude-in-chrome__navigate` to the start URL.
2. `mcp__claude-in-chrome__read_page` `{ filter: "interactive" }` to see
   the forms and controls. Use `mcp__claude-in-chrome__javascript_tool`
   to read the real `id` / `name` / `type` / `required` of each field and
   which `<form>` it belongs to — a page can have several forms
   (a real content form, a footer newsletter box, a search box); know
   which one you are testing so you don't misattribute a message from
   another form.
3. **Decide what to submit.** There is no fixed probe list — choose
   inputs that will actually exercise the scenario the user asked for and
   the form in front of you. Typical useful submissions, pick what fits:
   - **the happy path** — valid values for every field (real credentials
     if the user gave them); this is the `@positive` scenario
   - **all fields blank** — required-field behaviour
   - **one field format-wrong** — bad email, letters in a number field
   - **a very long value** — length-boundary behaviour (note the length
     you used, e.g. `x… (5000 chars)`)
   - **an injection string** — `' OR '1'='1` and/or
     `<script>window.__x__=1</script>`; for the script payload, check
     afterwards with `javascript_tool` whether `window.__x__` got set
     (i.e. whether it executed)
   Skip any that don't make sense for the form; add others the form
   invites (a multi-step wizard, a confirmation page, a "resend" button).
4. For **each** submission: reload / re-navigate to a clean form
   (`mcp__claude-in-chrome__navigate`), fill the fields
   (`mcp__claude-in-chrome__form_input` by ref — a raw `el.value = …` via
   `javascript_tool` will not fire a framework's onChange, so the form
   sees empty fields), click the real submit control
   (`mcp__claude-in-chrome__computer` `left_click` on its ref or
   coordinate), wait ~1s, then record with `javascript_tool` /
   `read_page`:
   - `location.href` before and after → `navigated` (did it change?)
   - every **visible** message / alert / inline validation text —
     verbatim, and note which form/element it belongs to
   - for the script payload: did `window.__x__` get set?
5. Follow multi-step flows through to their real end (e.g. Signup
   name+email → the account-details page → submit that too), recording
   each step's real outcome, **only if** the user approved the
   state-changing submit in Step 1.
6. Close the tab with `mcp__claude-in-chrome__tabs_close_mcp` when done.

### Step 3 — write down what you observed

Keep a scratch record at
`<project-root>/.claude/.scratch/gen-feature/observations.json`
(gitignored — working notes, not a deliverable). One entry per page, per
form, per submission. Shape:

```jsonc
{
  "startUrl": "https://automationexercise.com/",
  "capability": "registration",
  "observedAt": "2026-08-29T…",
  "stateChangingApproved": true,
  "observations": [
    {
      "url": "https://automationexercise.com/login",
      "title": "Automation Exercise - Signup / Login",
      "form": {
        "which": "the Signup form (name + email), distinct from the login form and the footer newsletter box",
        "fields": [
          { "label": "Name",  "name": "name",  "type": "text",  "required": true },
          { "label": "Email", "name": "email", "type": "email", "required": true }
        ],
        "submit": "Signup"
      },
      "submissions": [
        {
          "what": "valid name + email",
          "inputs": { "name": "Probe User", "email": "probe.user+1@example.com" },
          "observed": {
            "fromUrl": "https://automationexercise.com/login",
            "toUrl": "https://automationexercise.com/signup",
            "navigated": true,
            "messages": ["Enter Account Information"],
            "scriptExecuted": false
          }
        },
        {
          "what": "all fields blank",
          "inputs": { "name": "", "email": "" },
          "observed": {
            "fromUrl": "https://automationexercise.com/login",
            "toUrl": "https://automationexercise.com/login",
            "navigated": false,
            "messages": ["Please fill out this field."],
            "scriptExecuted": false
          }
        }
        // …one per submission you actually made
      ]
    }
    // …the /signup account-details form as its own entry, etc.
  ],
  "notProbed": [
    { "what": "<form/flow you did NOT submit>", "why": "state-changing and not approved / out of scope for this ask" }
  ],
  "notCovered": [
    "rate-limiting", "session expiry", "concurrent tabs", "server-error handling", "keyboard-only a11y"
  ]
}
```

`notCovered` is for behaviour classes nobody exercised — they become
`# not covered:` comments, never invented scenarios.

### Step 4 — write the feature file(s) from observations ONLY

Read `reference/gherkin-rules.md` first. Then:

- **One `.feature` per capability** (per form / purpose), not per page.
  Registration that spans two forms (name+email, then account details) is
  **one** `registration.feature` with a scenario per observed step-outcome.
- **Feature name** from the page title / form purpose; add the 3-line
  role / goal / benefit narrative.
- **Record the site in the `Feature:` description** — plain Gherkin lines
  (no leading `#`) between the `Feature:` name and the
  `Background:` / first `Scenario:`:
  - `Site: <start URL>`
  - `Page under test: <final URL of the form's page>`
  - `Reached via: <path>` — e.g. `home page -> Signup / Login link` — only
    when you navigated to it rather than starting there
  Do **not** name the scratch `observations.json`, the MCP tools, or any
  tooling in the feature file — it describes the site under test, not how
  the scenarios were produced.
- **Every submit step spells out the EXACT input** as a data table keyed
  by field name, right after the `When`. Blank field → empty cell. A long
  value → the literal marker you recorded (`x… (5000 chars)`). Never
  paraphrase ("with valid details"). See `gherkin-rules.md` §1.
- **One scenario per submission that produced a distinct observed
  outcome.** Map assertions straight from `observed`:
  - `navigated: true` + a new `toUrl` → `Then` the user reaches the
    "<page name from toUrl>" page
  - `navigated: false` → `Then` the user stays on the "<page>"
  - `messages: [...]` → `Then` the message "<exact observed text>" is
    shown — verbatim, keep any prefix
  - script payload + `scriptExecuted: false` → `And` the injected script
    does not run; `scriptExecuted: true` → a `@security` scenario stating
    it RUNS — surface it loudly as a finding
- **Collapse submissions with an identical observed outcome** into one
  `Scenario Outline` — fixed fields as literal cells, the varying
  field(s) as `<placeholder>` with one `Examples` row per input.
- **`notProbed[]`** → one `# not probed: <what> — <why>` comment near the
  top. No scenarios for them.
- **`notCovered[]`** → one `# not covered: <class>` comment. No scenarios.
- **Nothing observed for a capability = no scenario.** If you could not
  reach or safely exercise the thing the user asked for, say so in a
  `# not covered:` comment and tell the user — do not invent it.
- Declarative phrasing for everything except the input table;
  ≤ ~7 steps per scenario (the table doesn't count); one behaviour each.
- Tags: capability (`@registration`, `@login`), `@positive` / `@negative`,
  `@boundary` (long value), `@security` (injection), `@slow` (multi-step).
  There is **no `@speculative`** — every scenario is observed.
- Put a `# observed:` comment on every scenario pointing at the
  submission that justifies it. If you cannot write that comment, delete
  the scenario.
- This skill writes `.feature` files only — not step code — unless the
  user asks. For step code, use the `write-step-defs` skill.

### Step 5 — validate the generated Gherkin (optional)

Locate the cucumber binary the project actually has and dry-run the new
file(s):

```bash
node node_modules/@cucumber/cucumber/bin/cucumber.js <feature-dir>/<name>.feature --dry-run
```

If `node_modules/@cucumber/cucumber/bin/cucumber.js` isn't present, use
whatever `package.json` script runs the BDD suite with `-- --dry-run`
appended.

Exits non-zero on a Gherkin **syntax** error. "Undefined scenarios" is
expected — this skill writes `.feature` files, not step code.

> Prefer the binary path above over `npx cucumber-js` — in some setups
> `npx cucumber-js` resolves to an unrelated placeholder package.

## Gotchas

- **Multiple forms on one page cross-contaminate a naive read.**
  `/login` on automationexercise.com has a login form, a signup form, and
  a footer newsletter box. A message like "You have been successfully
  subscribed!" is the newsletter form, not signup. Always confirm which
  `<form>` a field and a message belong to (`javascript_tool`:
  `el.closest('form')`) before recording it.
- **`el.value = …` doesn't fire onChange** on React/Vue/Angular forms —
  the form still submits empty. Use `mcp__claude-in-chrome__form_input`
  by element ref, then a real click.
- **State-changing submits really happen.** `--allow-writes` is gone;
  there is no flag. YOU decide, and you must have the user's ok first.
  A signup submission creates an account; a checkout places an order.
- **Do not trigger `alert()` / `confirm()` / `prompt()`** — a modal
  dialog freezes the extension. If a control is likely to raise one,
  don't click it; note it under `notProbed`.
- **SPA timing.** Wait ~1s after a submit before reading; if a known
  message is missing, wait longer and re-read rather than recording a
  false negative.
- **Auth pages.** To probe behind a login, log in first via the browser
  tools, keep the tab, then navigate to the authed page.
- **Every scenario must trace to an observed submission.** If you can't
  point at the record that produced it, delete it.

## Troubleshooting

| Symptom | Fix |
|---|---|
| the browser tools aren't responding | you may have triggered a native dialog — the user must dismiss it in Chrome; then `tabs_context_mcp` to re-sync |
| a message you expected isn't in the DOM after submit | wait longer, re-read; the form may post via XHR with a delay |
| can't tell which form a field is in | `javascript_tool`: `document.querySelector('#theField').closest('form').outerHTML.slice(0,200)` |
| `cucumber.js … --dry-run` parse error | Gherkin syntax — 2-space indent, one `Background` per feature, `Examples` under every outline |
| dry-run says "Undefined scenarios" | not an error — Gherkin valid, steps not implemented |
| the form is state-changing and the user hasn't approved | do not submit it; write `# not probed:` and ask |

## Files

- `.claude/skills/gen-feature/SKILL.md` — this workflow
- `.claude/skills/gen-feature/reference/gherkin-rules.md` — Gherkin rules + the observed-only → Gherkin mapping

The skill folder above is repo-agnostic and portable. Its run-time
scratch record lives **outside** the folder, per repo:

- `<project-root>/.claude/.scratch/gen-feature/observations.json` — the
  scratch record of what you observed (gitignored; regenerated each run;
  never copied between repos)
