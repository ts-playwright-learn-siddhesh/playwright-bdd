# gen-feature — usage

Turn a live web app / URL into Cucumber `.feature` files whose every
scenario is backed by a **real, observed response** — never an assumption.

`SKILL.md` is the authoritative spec (loaded by the agent). This README is
the short human-facing version.

## What it does

1. **The agent drives the live site with the `claude-in-chrome` browser
   tools** — navigates, inspects each form, submits it with real inputs it
   chooses for the scenario at hand (happy path, all-blank, one field
   format-wrong, a long value, an injection string, plus any multi-step
   continuation), and records exactly what happened: resulting URL,
   whether it navigated, visible message / validation text, whether an
   injected `<script>` executed.
2. **The agent writes `.feature` files** from those observations per
   `reference/gherkin-rules.md`. Rule: **if a behaviour was not observed
   this session, it is not written.** No guessing, no `@speculative`.

There is **no crawler script** and **no fixed probe list** — the agent
decides what to submit based on the site, the form, and what the user
asked to cover.

## How to run it

Ask in chat, e.g.:

- "generate a feature file for `<url>`"
- "write Gherkin / BDD scenarios for the contact form at `<url>`"
- "cover the registration page at `<url>`"
- `/gen-feature <url> — <which form/capability>`

### Prerequisites

The `claude-in-chrome` MCP tools must be available. `@cucumber/cucumber`
is only needed for the optional `--dry-run` syntax check.

## State-changing forms

Submitting a signup / checkout / payment / profile form **really creates
accounts or places orders on the target**. The agent will name what a
submission does and ask for your explicit ok before doing it. A public
demo site built for testing is normally fine; a real product is not.

## Output — what is generated and where

| File | Location | Committed? | Purpose |
|---|---|---|---|
| `observations.json` | `<project-root>/.claude/.scratch/gen-feature/observations.json` | **No — gitignored** | The agent's scratch record of every submission and its real outcome. Working notes, regenerated each run. Lives outside the skill folder so it never travels between repos. |
| `<capability>.feature` | the project's detected feature dir (see Step 0) | **Yes** | The deliverable. One file per capability (per form / purpose), including multi-form flows like registration. |

The skill generates `.feature` files **only** — no step definitions, no
config — unless you explicitly ask. For step code, use the
**`write-step-defs`** skill.

## What a generated `.feature` contains

- **Site provenance in the `Feature:` description** (plain Gherkin lines,
  no `#`): `Site:`, `Page under test:`, and `Reached via:` (when the page
  was navigated to rather than the start URL). Tooling names
  (`observations.json`, MCP tools) are **never** put in the feature file.
- One scenario per submission that produced a distinct observed outcome;
  submissions with an identical outcome collapse into one `Scenario
  Outline`.
- **Every submit step carries a field-keyed data table** of the exact
  values submitted — never a paraphrase. A long value → the literal
  marker recorded (`x… (5000 chars)`); a blank field → an empty cell.
- Exact observed message text in `Then` steps (prefixes kept verbatim).
- `# observed:` comment on each scenario tracing it to its submission.
- `# not probed:` (state-changing and unapproved, or blocked) and
  `# not covered:` (classes never exercised) as comments.

## Validate the output

```bash
node node_modules/@cucumber/cucumber/bin/cucumber.js <feature-dir>/<name>.feature --dry-run
```

(or the project's BDD-suite `package.json` script with `-- --dry-run`).

Exits non-zero on a Gherkin **syntax** error. "Undefined scenarios" is
expected — this skill writes `.feature` files, not step code.

> Prefer the binary path above over `npx cucumber-js` — in some setups it
> resolves to an unrelated placeholder package.

## Pairs with `write-step-defs`

`gen-feature` writes the `.feature` from observed site behaviour;
`write-step-defs` re-drives the site to discover selectors and writes the
runnable step code. Flow: `/gen-feature <url>` → review the `.feature` →
`/write-step-defs` → run.

## Files in this folder (all portable — copy the folder to any repo)

- `SKILL.md` — authoritative spec the agent follows
- `reference/gherkin-rules.md` — Gherkin rules + the observed-only → Gherkin mapping
- `README.md` — this file

The run-time scratch record lives **outside** this folder, per repo:
`<project-root>/.claude/.scratch/gen-feature/observations.json`
(gitignored, regenerated each run).
