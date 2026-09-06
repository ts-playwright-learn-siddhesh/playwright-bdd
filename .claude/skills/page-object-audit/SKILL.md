---
name: page-object-audit
description: Static consistency check for a Playwright + Cucumber-BDD + TypeScript project — finds drift between .feature files, step definitions, page objects, and World fields (undefined/unused steps, dangling page names, orphaned methods, duplicate overrides, locator convention breaks). Use when asked to "audit steps", "check for dead code in features/pages", "find drift", or before/after editing .feature or .steps.ts files. Report-only — never runs tests or a browser.
---

# page-object-audit — static drift check for a Playwright-BDD suite

Report-only. **Do not run any tests or start a browser.** No file is
edited — findings only.

Repo-agnostic: nothing below assumes `src/features/`, `src/pages/`,
`PlaywrightWorld`, `BasePage`, or `PAGE_PATHS` by name. Everything is
discovered from the project in front of you. **Always detect first.**

## Step 0 — detect the suite

1. **Feature files:** glob `**/*.feature` (prune `node_modules`, `.git`,
   `dist`, `build`, `reports`). Their common parent is the features dir.
2. **Step definitions:** glob `**/*.steps.ts` (and `**/*.steps.js` if the
   project is JS). Common parent = steps dir.
3. **Page objects:** glob `**/*.page.ts`. Common parent = pages dir. Among
   them, find the **base class** — the one every other `*.page.ts` file
   `extends` (often `base.page.ts`, but read the `extends` clauses, don't
   assume the filename). Note its exported class name and the helper
   methods it defines (navigation + assertion helpers, e.g. an
   `open()` / `expectPage()` / `expectText()` style trio — names vary).
4. **World:** glob `**/world.ts` / `**/world.js`, or search the support
   dir for a file that calls `setWorldConstructor(...)`. Read it to get
   the **actual World class name** and the fields it declares.
5. **Page-name → URL map:** in the base page (or wherever `expectPage`
   lives), find the object literal typed `Record<string, string>` that
   maps Gherkin page names to URL fragments. Note its name (commonly
   `PAGE_PATHS`, but take it from the code) and its keys.

If **no `.feature` files** are found, stop and report:
`no Cucumber-BDD suite detected under <cwd> — nothing to audit`.

State back, in one or two lines, what you detected (features dir, steps
dir, pages dir, base class name, World class name, page-map name) before
listing findings.

## Checks

Read every detected feature file, step-def file, every `*.page.ts`
(including the base), and the World file. Report each of the following
with `file:line` references:

1. **Undefined steps** — a `Given/When/Then/And/But/*` line in a
   `.feature` with no matching step definition. Account for Cucumber
   expression params (`{string}`, `{int}`, `{float}`, custom
   `defineParameterType`), regex step defs, and `Scenario Outline`
   `<placeholder>` substitution (a step written with `"<user>"` matches a
   `{string}` def).
2. **Unused step definitions** — a `Given/When/Then` in a step-def file
   that no `.feature` invokes.
3. **Dangling page names** — a step that passes a page name to the
   `expectPage`-style helper (as a literal or a Gherkin `{string}`/table
   value) where that name has **no key** in the detected page-name map,
   so it silently falls through to the raw-fragment branch.
4. **Unused page-name-map entries** — a key in the map that no step or
   scenario ever references.
5. **Orphaned page-object methods** — a public method on a class that
   `extends` the base page, which no step definition calls.
6. **Pointless overrides of the base page** — a subclass method that
   overrides a base-class method with identical or near-identical logic,
   or reimplements something the base already provides (e.g. re-fetching
   a locator the base's `locator()` helper would return).
7. **Broken locator conventions** — a locator built from a raw
   CSS/XPath string where a user-facing Playwright locator
   (`getByRole` / `getByLabel` / `getByPlaceholder` / `getByText` /
   `getByTestId`) would work, OR a locator whose adjacent comment
   (e.g. `// field "user-name"`) doesn't match the selector next to it.
8. **World/hook drift** — a field declared on the World class that no
   step definition or hook ever reads or writes.

## Output

For each finding: the check number (1–8), the `file:line`(s), and a
one-line fix suggestion.

- Report only — fix nothing.
- Omit a category entirely if it has no findings (don't print "none
  found" eight times).
- Keep the report under ~40 lines; group by category, most actionable
  first.

## Files

- `.claude/skills/page-object-audit/SKILL.md` — this workflow (the whole
  skill; nothing repo-specific, safe to copy to any repo)
