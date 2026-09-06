# Gherkin rules & syntax cheat-sheet

Distilled from the official Cucumber docs (cucumber.io/docs/bdd/better-gherkin,
cucumber.io/docs/gherkin/reference) and current community practice (2025–2026).
`gen-feature` writes `.feature` files to these rules.

---

## 1a. Coverage policy — OBSERVED ONLY (read first)

Every scenario in a generated `.feature` file **must trace to a submission
you actually made against the live site this session**, recorded in
`observations.json`. If a behaviour was not exercised and its real
response recorded, it is **not** written. No guessing, no `@speculative`
tag, no "I couldn't reach it so I inferred it". Missing coverage is
reported as a `# not covered:` comment, never as an invented scenario.

### What you submit, per form

There is **no fixed probe list**. You (driving the site via the
`claude-in-chrome` tools) choose submissions that exercise the scenario
asked for and suit the form in front of you. The usual useful set — pick
what fits, skip what doesn't, add what the form invites:

| submission | what it submits | scenario it justifies |
|---|---|---|
| happy path | valid values for every field (real creds if given) | `@positive` success outcome |
| all blank | every field empty | required-field / empty-submit behaviour |
| one field format-wrong | bad email, letters in a number field, … | validation / rejection behaviour |
| very long value | a long string in a text field (record the length, e.g. `x… (5000 chars)`) | `@boundary` length behaviour |
| injection | `' OR '1'='1` and/or `<script>window.__x__=1</script>` | `@security` — assert rejection / no bypass; for the script payload, check `window.__x__` and assert it did **not** run |

Plus any multi-step continuation the form leads to (a wizard, a
confirmation page, a verb-like button), each recorded as its own
submission.

### Mapping `observed` → Gherkin (do exactly this)

**The `When` step always carries a field-keyed data table of the exact
submitted values** (see §1, first rule); the mappings below are for the
`Then`/`And` assertions:

| observed field | becomes |
|---|---|
| `navigated: true` and `toUrl` is a different page | `Then` the user reaches the "<page name from toUrl>" page |
| `navigated: false` | `Then` the user stays on the "<page>" |
| `messages: ["<text>", …]` | `Then` the message "<exact text>" is shown — **verbatim, keep any prefix** |
| `messages: []` on a success submission | assert only the navigation / a known success marker |
| script payload, `scriptExecuted: false` | `And` the injected script does not run |
| `scriptExecuted: true` | `And` the injected script runs — flag this loudly; it's a real finding |

If a submission could not be completed (control not found, blocked by a
dialog) — do **not** write a scenario; note it under `notProbed` /
`# not probed:`.

### Collapse identical outcomes

If several submissions produced the **same** `observed` outcome (same
`navigated`, same `messages`), write **one** `Scenario Outline` with one
`Examples` row per input, instead of near-duplicate scenarios. The `When`
step still carries the field-keyed data table; the field(s) that differ
use `<placeholder>` cells listed in `Examples` with their exact values.
Keep the injection row even in a collapsed outline if it additionally
asserts "script does not run".

### `notProbed` and un-exercised classes

- Each entry in `notProbed[]` → one `# not probed: <what> — <why>`
  comment at the top of the relevant feature. No scenarios. It is there
  because it is state-changing and unapproved, or out of scope for the
  ask, or blocked.
- Behaviours nobody exercised (rate-limiting, concurrency across tabs,
  backend 500, session expiry, keyboard-only a11y) are **out of scope**.
  List them once under a `# not covered:` comment so the gap is visible.
  Do not invent scenarios for them.

### Tags (every scenario is observed — there is no `@speculative`)

- Capability: `@login`, `@checkout`, `@search` …
- Nature: `@positive` / `@negative`
- Kind: `@boundary` (from `too-long`), `@security` (from `sql-ish` / `xss`)
- `@slow` — multi-step / e2e

Lets a run pick e.g. `--tags "@login and @negative"`.

---

## 1. Writing rules (the important part)

### State the EXACT input that was submitted — never a generic paraphrase
**Hard rule. This overrides "declarative" and "avoid incidental details"
below wherever they conflict.**

Every scenario that submits a form MUST show the exact value put in every
field of that form — the real value you typed into that field this
session (recorded in `observations.json` → `submissions[].inputs`). A
field left empty is shown as an empty cell.

Use a **data table keyed by field name** right after the submit step:

```gherkin
When the visitor submits the Contact Us form:
  | first_name | Probe                  |
  | last_name  | User                   |
  | email      | probe.user@example.com |
  | message    | Probe Value            |
Then the message "Thank You for your Message!" is shown
```

For a `Scenario Outline`, put the varying field(s) in `Examples` and the
fixed fields in the table with `<placeholder>` cells:

```gherkin
When the visitor submits the Contact Us form:
  | first_name | Probe        |
  | last_name  | User         |
  | email      | <email>      |
  | message    | Probe Value  |
Then the message "Error: Invalid email address" is shown

  Examples:
    | email                             |
    | not-an-email                      |
    | ' OR '1'='1                       |
```

**Banned:** "with a first name, a last name, a valid email address and a
comment", "with valid details", "with every field blank" *without the
table*, or any wording that makes the reader go look up what was actually
typed. If you cannot name the exact value, you did not observe it — see
§1a.

Long values (the 5000-char `too-long` probe): write the literal marker
`x… (5000 chars)` in the cell — that is the exact recorded input, stated
exactly.

### Describe *behaviour* for everything EXCEPT the input values
Scenarios say **what** the user achieves and assert **what** the system
shows; step definitions hold **how** (selectors, clicks, waits). The one
exception is the submitted input — that is always spelled out per the rule
above.

**Bad (imperative UI mechanics — breaks on every UI tweak):**
```gherkin
Given I visit "/login"
When I type "Bob" into the field with id "user-name"
And I click the button with class "btn_action"
Then the <h3> with data-test "error" reads "..."
```

**Good (exact input, declarative mechanics):**
```gherkin
Given the login page is open
When the shopper signs in:
  | user-name | standard_user |
  | password  | secret_sauce  |
Then the shopper reaches the "inventory" page
```

### One behaviour per scenario
Each scenario tests exactly one thing (single-responsibility). Multiple
behaviours in one scenario make a failure ambiguous. If a scenario needs
more than ~7 steps, it's doing too much — split it. This governs scenario
*scope*; the *number* of scenarios is whatever the observations justify
(see §1a) — no more, no less.

### Scenarios are independent
Any scenario can run alone, in any order, and give the same result. No
scenario depends on state left by a previous one.

### No conjunctive steps
One action per step. Split `When I log in and add an item` into two steps
(or better, one declarative step whose definition does both).

### Use `And` / `But`, not repeated `Given`/`When`/`Then`
```gherkin
Given the account is verified
And the account has a saved address
```
not `Given … Given …`.

### Avoid incidental details — but NOT the submitted input
Keep out genuinely irrelevant noise (random request IDs, timestamps,
session tokens). **Form field values are never "incidental"** — they are
the exact input that produced the observed outcome and MUST appear in the
scenario as a field-keyed data table (see the first rule in this section).
Do not push them into step definitions, do not replace them with a
persona, do not paraphrase them.

### `Then` asserts observable output
Check what the user/system can see (page shown, message displayed, total
value), not internal database rows.

### Consistent terminology
Reuse the same phrasing for the same action across all features so step
definitions are shared, not duplicated. Pick "signs in" **or** "logs in",
not both.

### Background = shared `Given` only
Put steps common to every scenario in the feature into `Background`. Keep
it short (2–3 steps). Never put `When`/`Then` in a `Background`.

### `Scenario Outline` for the same behaviour with varied data
Required-field validation, boundary values, role matrices. One row per
case in the `Examples` table. Don't use it to cram unrelated scenarios
together.

### Feature narrative
Under `Feature:` add the 3-line intent:
```gherkin
Feature: Account login
  As a registered shopper
  I want to sign in
  So that I can access my order history
```

### Tags
- Capability tag on the `Feature`: `@login`, `@checkout`
- Cross-cutting tags on scenarios: `@smoke`, `@slow`, `@wip`, `@negative`
Tags are for selecting subsets at run time (`--tags "@smoke and not @wip"`).

---

## 2. Syntax reference

### File structure & keywords
| Keyword | Colon? | Notes |
|---|---|---|
| `# language: xx` | — | optional first line, sets spoken language (default English) |
| `Feature:` | yes | first keyword in the file; free-form text allowed under it |
| `Rule:` | yes | optional (Gherkin 6+), groups scenarios under one business rule; may have its own `Background` |
| `Background:` | yes | one per Feature (or per Rule); runs before each scenario |
| `Scenario:` / `Example:` | yes | synonyms; a concrete case |
| `Scenario Outline:` / `Scenario Template:` | yes | parameterised scenario; needs `Examples` |
| `Examples:` / `Scenarios:` | yes | data table for an outline; `<param>` placeholders |
| `Given` `When` `Then` `And` `But` `*` | no | steps; `*` = generic bullet |

Rules:
- Indent with **2 spaces** (tabs allowed but don't mix).
- Non-blank lines must start with a keyword — except free-form description
  text directly under `Feature` / `Rule` / `Scenario` / `Background` / `Scenario Outline`.
- One `Background` per `Feature` (or per `Rule`), placed before the first scenario.
- `Scenario Outline` **requires** at least one `Examples` table.

### Step arguments
- **Doc string** (large text block) — triple quotes or triple backticks,
  indented to match the step:
  ```gherkin
  Given a request body:
    """
    { "name": "Bob" }
    """
  ```
- **Data table** — pipe-delimited, first row usually headers:
  ```gherkin
  Given the following users exist:
    | name  | role  |
    | Alice | admin |
    | Bob   | user  |
  ```
  Escapes inside cells: `\|` pipe, `\n` newline, `\\` backslash.

### Scenario Outline + Examples
```gherkin
Scenario Outline: Required credentials are enforced
  When the shopper submits the login form with username "<username>" and password "<password>"
  Then the error "<message>" is shown

  Examples:
    | username      | password     | message              |
    |               | secret_sauce | Username is required |
    | standard_user |              | Password is required |
```

### Comments
Whole-line only, start with `#`. This skill uses them to trace provenance:
```gherkin
# observed: blank submission -> stayed on /, message shown
# not probed: Sign Up — state-changing; user did not approve submitting it
# not covered: rate-limiting — not exercised this session
```

### Full example — written from observed submissions only
```gherkin
# not covered: rate-limiting, session expiry, concurrent tabs, server-error
#              handling, keyboard-only a11y — not exercised.

@login
Feature: Account login
  Site: https://www.saucedemo.com
  Page under test: https://www.saucedemo.com/

  As a shopper
  I want to sign in to Swag Labs
  So that I can reach the product catalog

  Background:
    Given the login page is open

  @positive
  Scenario: Sign in with valid credentials
    # observed: valid probe -> navigated to /inventory.html
    When the shopper submits the login form:
      | user-name | standard_user |
      | password  | secret_sauce  |
    Then the shopper reaches the "inventory" page

  @negative
  Scenario: Submitting the form with both fields blank is rejected
    # observed: blank probe -> stayed on /, message shown
    When the shopper submits the login form:
      | user-name |  |
      | password  |  |
    Then the message "Epic sadface: Username is required" is shown
    And the shopper stays on the "login" page

  @negative
  Scenario Outline: Credentials that do not match a user are rejected
    # observed: format-wrong, long, and injection submissions -> identical outcome
    When the shopper submits the login form:
      | user-name | <username> |
      | password  | <password> |
    Then the message "Epic sadface: Username and password do not match any user in this service" is shown
    And the shopper stays on the "login" page

    Examples:
      | username                          | password                          |
      | not-an-email                      | !!                                |
      | x… (5000 chars)                   | x… (5000 chars)                   |
      | ' OR '1'='1                       | ' OR '1'='1                       |
      | <script>window.__x__=1</script>   | Probe#Pass123                     |

  @negative @security
  Scenario: An inline script in the username is not executed
    # observed: script-payload submission -> window.__x__ never set
    When the shopper submits the login form:
      | user-name | <script>window.__x__=1</script> |
      | password  | Probe#Pass123                   |
    Then the message "Epic sadface: Username and password do not match any user in this service" is shown
    And the injected script does not run
```

Every `# observed:` comment points back at the submission that justifies
the scenario. If you cannot write that comment, delete the scenario.

---

## 3. Mapping `observations.json` → Gherkin

| `observations.json` field | becomes |
|---|---|
| `observation.title` / form purpose | `Feature:` name |
| a `form` (by purpose) | one feature, or a scenario group within one |
| `form.fields[]` + the submission's `inputs` value for each | the **field-keyed data table** on the `When` step — exact values, empty cell for blank, `x… (5000 chars)` for a long value |
| a submission that navigated on success | the `@positive` happy-path scenario |
| the all-blank submission | the empty-submit scenario (table with all cells empty), asserting `observed.messages` verbatim |
| format-wrong / long / injection submissions with the same `observed` | one `@negative` `Scenario Outline`; fixed fields in the table, varying field(s) as `<placeholder>` + one `Examples` row per input |
| `observed.messages` | `Then the message "<verbatim text>" is shown` — keep prefixes like `Epic sadface:` |
| `observed.navigated` + `observed.toUrl` | `Then the shopper reaches "<page>"` / `Then the shopper stays on "<page>"` |
| script-payload submission + `observed.scriptExecuted: false` | `And the injected script does not run` |
| script-payload submission + `observed.scriptExecuted: true` | a `@security` scenario stating the script RUNS — surface as a finding |
| a submission you could not complete | no scenario; add `# not probed: <form> — <why>` |
| a multi-step continuation (wizard step, verb button) | one scenario per observed step-outcome, mapped by the same rules |
| `notProbed[]` entry | `# not probed: <what> — <why>` comment, no scenario |
| `notCovered[]` class | `# not covered: <class>` comment, no scenario |

---

## 4. Project integration (step definitions)

This skill writes `.feature` files only. To turn them into runnable step
code, use the **`write-step-defs`** skill — it drives the same live site
to discover real selectors and emits the World / hooks / cucumber config /
Page Objects / step definitions.

The `.feature` files go in the project's detected feature directory (the
common parent of any existing `**/*.feature`; if none, `src/features/`
when a `src/` exists, else `features/`). A typical Playwright-BDD-TS
layout has step defs in `step-definitions/` and the World + hooks in
`support/` alongside it, and runs the suite through a `package.json`
script that invokes `@cucumber/cucumber` — but read the actual project
rather than assuming those names. Prefer
`node node_modules/@cucumber/cucumber/bin/cucumber.js …` over
`npx cucumber-js` when validating (the latter can resolve to a
placeholder package).

---

## Sources
- https://cucumber.io/docs/bdd/better-gherkin/
- https://cucumber.io/docs/gherkin/reference/
- https://testquality.com/cucumber-and-gherkin-language-best-practices/
- https://qaskills.sh/blog/playwright-cucumber-bdd-integration-guide
- https://www.browserstack.com/guide/playwright-cucumber
- https://dilshankelsen.com/set-up-custom-world-for-cucumber-playwright-tests-in-typescript/
