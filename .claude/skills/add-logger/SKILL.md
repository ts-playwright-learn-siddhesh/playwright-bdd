---
name: add-logger
description: Add a production-grade, framework-agnostic logger built on winston (levels, transports, formats) and @colors/colors (safe-mode console colorization) to any Playwright + Cucumber-BDD + TypeScript project. Detects the target project's actual structure (tsconfig, src layout, package manager, ESM vs CommonJS) instead of assuming any fixed paths, then generates a single logger module, wires it into Cucumber hooks/World for per-scenario attribution, and adds a usage example. Use when asked to "add logging", "set up a logger", "add winston logging", "colorize console output", "add structured logging to this framework", or "add a logger to this project".
---

# add-logger — winston + @colors/colors logger for any Playwright-BDD-TS project

Generic, repo-agnostic. Do not assume any project's paths
(`src/support/world.ts`, `src/pages/`, etc.) apply to the target project —
they are one possible detected layout among many. **Always detect first.**

Inputs: the target project's existing files (package.json, tsconfig.json,
whatever step-definition/hook files already exist). No external site, no
browser driving — this skill only reads and writes local files.

## Runs alongside `write-step-defs`?

If the same piece of work also scaffolds step definitions: on a **fresh**
project, run **`write-step-defs` first** so a World and hooks exist, then
this skill — running `add-logger` against a repo with no World file
forces the degraded "no World detected" fallback (module-level logger
only, no `this.log` wiring) in Step 5. On an **established** project the
order doesn't matter. Both skills edit the World/hooks files, so run one
to completion before starting the other rather than interleaving.

## Workflow

### Step 1 — detect project structure

Read, in order, whatever exists:

1. `package.json` — package manager (`packageManager` field, or which
   lockfile is present: `package-lock.json` → npm, `yarn.lock` → yarn,
   `pnpm-lock.yaml` → pnpm), `"type"` field (`module` = ESM, absent/
   `commonjs` = CJS), existing deps (`winston`, `@colors/colors`, or the
   older `colors` package already present?), and scripts (how tests run —
   `cucumber-js`, `cucumberTs`, a custom runner).
2. `tsconfig.json` — `compilerOptions.module` / `moduleResolution` (confirms
   ESM vs CJS emit), `rootDir` / `baseUrl` / path aliases, `outDir`.
3. Directory layout — glob for `**/*.feature`, `**/*.steps.ts`,
   `**/world.ts`, `**/hooks.ts`, `**/*.page.ts` to find the support/step
   directory (commonly `src/support/`, `features/support/`, `test/support/`,
   or `src/step-definitions/`). Do **not** assume `src/support/world.ts` —
   confirm the actual World file path and its exported class name by reading
   it.
4. `.gitignore` — check whether a `logs/` (or similar) pattern already
   exists.

State back (briefly) what was detected: package manager, module system,
support directory path, World class name and its file, before generating
anything. If the project has no Cucumber World file at all (steps use plain
functions, or this is being added to a bare Playwright project), say so and
fall back to a standalone logger import with no World wiring.

### Step 2 — install dependencies

Using the detected package manager:

```bash
npm install winston @colors/colors
# or: yarn add winston @colors/colors
# or: pnpm add winston @colors/colors
```

Confirm no existing `colors` (unscoped, pre-@colors/colors fork) dependency
conflicts — if present, flag it to the user rather than silently removing it
(removing a dependency the project relies on elsewhere is out of scope for
this skill).

### Step 3 — decide file paths from what was detected

- Logger module: `<support-dir>/logger.ts` (e.g. `src/support/logger.ts` if
  that's the detected support directory; `features/support/logger.ts` if
  that's the layout instead).
- Log output directory: `logs/` at the project root, unless the project
  already has a `reports/` directory used for other run artifacts (e.g.
  `reports/cucumber-report.html`), in which case prefer `reports/logs/` to
  keep run artifacts together — ask if genuinely ambiguous.

### Step 4 — generate the logger module

Write `<support-dir>/logger.ts` (safe-mode `@colors/colors`, no global
`String.prototype` pollution):

```ts
import path from 'node:path';
import fs from 'node:fs';
import winston from 'winston';
import colors from '@colors/colors/safe';

const LOG_DIR = process.env.LOG_DIR ?? path.join(process.cwd(), 'logs');
const LOG_LEVEL =
  process.env.LOG_LEVEL ?? (process.env.CI ? 'info' : 'debug');

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const LEVEL_COLORS: Record<string, (s: string) => string> = {
  error: colors.red,
  warn: colors.yellow,
  info: colors.green,
  debug: colors.gray,
};

function findNestedStack(info: Record<string, unknown>): string | undefined {
  for (const value of Object.values(info)) {
    if (value instanceof Error && value.stack) return value.stack;
  }
  return undefined;
}

const consoleFormat = winston.format.printf((info) => {
  const { level, message, timestamp, stack, scenario, ...meta } = info as Record<string, unknown>;
  const colorize = LEVEL_COLORS[level as string] ?? ((s: string) => s);
  const scope = scenario ? colors.cyan(`[${scenario}] `) : '';
  const line = `${colors.gray(String(timestamp))} ${colorize(String(level).toUpperCase())} ${scope}${message}`;
  const effectiveStack = (stack as string | undefined) ?? findNestedStack(meta);
  return effectiveStack ? `${line}\n${colors.gray(effectiveStack)}` : line;
});

// Errors nested in metadata (e.g. logger.error('msg', { err })) don't survive
// JSON.stringify — Error's message/stack aren't own-enumerable. winston's
// format.errors({ stack: true }) only unwraps a *top-level* Error (passed
// directly as the log message), so metadata Errors are converted explicitly
// here via a JSON replacer.
function errorReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Error) {
    return { message: value.message, stack: value.stack };
  }
  return value;
}

function buildTransports(runId: string): winston.transport[] {
  return [
    new winston.transports.Console({
      format: consoleFormat,
    }),
    new winston.transports.File({
      filename: path.join(LOG_DIR, `run-${runId}.log`),
      format: winston.format.printf((info) => JSON.stringify(info, errorReplacer)),
    }),
  ];
}

const runId = new Date().toISOString().replace(/[:.]/g, '-');

// format.errors({ stack: true }) MUST be at the top-level createLogger call,
// not per-transport — per-transport-only placement silently drops the
// unwrapped message/stack for a top-level `logger.error(new Error(...))`.
export const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.errors({ stack: true }),
  ),
  transports: buildTransports(runId),
});

export function scenarioLogger(scenarioName: string): winston.Logger {
  return logger.child({ scenario: scenarioName });
}
```

Notes baked into the generated code:

- `@colors/colors/safe` is imported explicitly — never bare `@colors/colors`
  (that mutates `String.prototype`, which is the exact hazard the safe
  import avoids).
- `LOG_LEVEL` defaults to `info` under `CI=true` and `debug` otherwise — set
  `process.env.LOG_LEVEL` to override either way.
- File transport writes one JSON-lines file per run (`logs/run-<iso>.log`);
  the console transport stays human-readable and colorized.
- **`format.errors({ stack: true })` MUST sit on the top-level
  `createLogger({ format: ... })` call, never only on a per-transport
  `format`.** Verified: placing it only inside `buildTransports()`'s
  per-transport formats silently drops both `message` and `stack` for a
  top-level `logger.error(new Error('x'))` call — it logs as
  `{"level":"error","timestamp":"..."}` with nothing else. Moving the same
  `errors({ stack: true })` call to the logger-level `format` fixes it. This
  is a winston/logform behavior, not a version quirk — always put it there.
- **An `Error` nested inside metadata** (`logger.error('msg', { err })`)
  does **not** get unwrapped by `format.errors()` — that format only
  rewrites a top-level Error, not one buried in a metadata field — and a
  bare `JSON.stringify` on an `Error` serializes to `{}` since `message`/
  `stack` aren't own-enumerable. The `errorReplacer` above and
  `findNestedStack` in the console formatter both exist specifically to
  handle this case; don't drop them as "simplification," they cover a real,
  verified gap in winston's default behavior.
- `logger.child({ scenario })` (exposed as `scenarioLogger()`) is winston's
  built-in way to tag every subsequent line with metadata — no manual
  per-scenario file juggling needed unless the project specifically wants
  separate files per scenario (extension point, not the default).

### Step 5 — wire into Cucumber hooks / World (if a World exists)

If Step 1 found a Cucumber World file, add a `log` field so step
definitions can reach it as `this.log`:

- In the World class: import `scenarioLogger` from the logger module (path
  relative to the detected World file) and add
  `log!: winston.Logger;` (or the equivalent optional-field style already
  used in that World).
- In the `Before` hook: `this.log = scenarioLogger(this.pickle?.name ?? 'unknown');`
  — adjust to whatever the project's hook signature actually exposes (some
  expose `this.pickle`, others take the scenario as a hook argument;
  confirm against the real hook file before writing this line, don't guess
  the API shape).
- In the `After` hook: `this.log.info(`scenario finished: ${result?.status}`);`
  before teardown.

If no World/hooks file exists, skip this step and note in the usage example
that `logger` is a plain module-level singleton importable anywhere.

### Step 6 — usage example

Add a short example (in the response, not a committed file, unless the
project has a docs/examples convention) showing:

```ts
import { logger } from './support/logger'; // adjust to the detected path

logger.info('starting run');
logger.error('something broke', { err: new Error('boom') });

// inside a step definition, if wired to the World:
await someStep(this: PlaywrightWorld) {
  this.log.debug('filling login form');
}
```

### Step 7 — verify

- Add `logs/` (or the chosen log directory) to `.gitignore` if not already
  covered.
- Run a smoke check: a tiny script or `node -e` that imports the generated
  logger and calls `.info()`/`.error()` once, confirming: (a) colorized
  console output appears, (b) a file lands under the log directory, (c) the
  process exits cleanly (no dangling transport handles).
- **Specifically test both error-logging shapes, not just a plain string
  message** — this is where the two verified bugs in Gotchas hide:
  1. `logger.error(new Error('top-level test'))` → console must show the
     message **and** a gray stack trace beneath it; the file log's JSON
     line must contain non-empty `message` and `stack` fields.
  2. `logger.error('msg', { err: new Error('nested test') })` → console
     must still show a stack trace (via `findNestedStack`); the file log's
     `err` field must be `{"message":"...","stack":"..."}`, never `{}`.
  If either produces an empty/missing message or stack, the format
  placement or the replacer logic regressed — fix it before calling Step 7
  done.
- If the target project already has a test runner wired (e.g.
  `npm run cucumberTs -- --dry-run`), run it to confirm the added
  World/hook changes don't break step resolution.

## What gets generated

| File | Created when | Contents |
|---|---|---|
| `<support-dir>/logger.ts` | absent | winston logger: console + file transports, level from `LOG_LEVEL`/`CI`, colorized via `@colors/colors/safe`, `errors({ stack: true })`, `scenarioLogger()` child-logger helper |
| `<log-dir>/` (e.g. `logs/`) | absent | run log files, `run-<iso>.log` (JSON lines); created at runtime by the logger module itself, not by this skill directly |
| `.gitignore` entry for the log directory | missing | prevents run logs from being committed |
| World file edit | a World class exists | adds a `log` field populated per-scenario in `Before`, used from `After` and step definitions |

## Gotchas

- **`@colors/colors` (bare import) mutates `String.prototype`** — every
  string in the process gains `.red`, `.green`, etc., which can collide
  with other libraries or tests that don't expect it. Always import from
  `@colors/colors/safe` and call `colors.red(str)` instead.
- **winston + ESM interop**: winston's package is CJS-authored but ships a
  compatible default export; under `"type": "module"` projects,
  `import winston from 'winston'` works, but destructured named imports
  (`import { createLogger } from 'winston'`) can be unreliable across
  versions — prefer `import winston from 'winston'` and use
  `winston.createLogger(...)` off the default export, as generated above.
- **Windows console color support**: colors render correctly in Windows
  Terminal and recent PowerShell, but classic `cmd.exe` may show raw ANSI
  codes. `@colors/colors` disables color automatically when
  `process.stdout.isTTY` is false (e.g. piped output/CI logs) — do not
  force-enable colors for non-TTY output.
- **Duplicate transports on repeated `import`/hot-reload**: the logger
  module as generated is a singleton created once at module load — under
  `ts-node`/`tsx` watch mode or a test runner that re-imports the module
  per file, this can still create one instance per process (correct) but
  never per-import (module caching handles this). Do not call
  `winston.createLogger()` again anywhere else in the project — always
  import the shared `logger` (or `scenarioLogger()`).
- **CI vs local log level**: defaulting to `debug` locally and `info` in CI
  is deliberate — verbose debug-level file logs in CI balloon artifact size
  fast. Override per-run with `LOG_LEVEL=debug` in CI only when actively
  debugging a flaky run, not as a permanent setting.
- **Log directory must exist before the File transport opens** — the
  generated module creates it synchronously at import time
  (`fs.mkdirSync(..., { recursive: true })`); don't remove that guard when
  customizing, or the first run on a clean checkout throws `ENOENT`.
- **`format.errors({ stack: true })` set only per-transport silently loses
  the error** — confirmed by direct testing against `winston@3.19.0`. A
  top-level `logger.error(new Error('x'))` logs as an empty
  `{"level":"error","timestamp":"..."}` line with no `message`/`stack` at
  all when `errors()` is only inside a transport's own `format`. It must be
  in `createLogger({ format: winston.format.combine(..., errors({ stack:
  true })) })` at the top level. This is the single most important thing to
  get right in the generated module — verify it (see Step 7) rather than
  trusting the sample code alone if winston's internals change in a future
  version.
- **An `Error` inside metadata isn't unwrapped or serialized by default** —
  `logger.error('msg', { err: new Error('x') })` produces `"err":{}` in the
  JSON file log (Error's `message`/`stack` are non-enumerable, so plain
  `JSON.stringify` drops them) and no stack trace at all in the console
  output, even with `errors({ stack: true })` correctly placed at the top
  level (that format only unwraps a *top-level* Error, not one nested in
  metadata). The generated module's `errorReplacer` (file transport) and
  `findNestedStack` (console transport) exist to cover exactly this case —
  keep both.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Console output shows raw `\x1b[32m` codes instead of color | Non-TTY output (piped/CI) — expected; `@colors/colors` disables color there by default. If you need color anyway, don't force it — the noise in captured logs isn't worth it. |
| `TypeError: winston.createLogger is not a function` | Default-vs-named import mismatch under this project's module setting — use `import winston from 'winston'; winston.createLogger(...)` (default export), not a named import. |
| Strings elsewhere in the codebase unexpectedly have `.red`/`.green` methods | Something imported bare `@colors/colors` instead of the `/safe` entry point — grep for `from '@colors/colors'` (without `/safe`) and fix the import. |
| `ENOENT` writing the log file on a fresh checkout | The log directory doesn't exist yet and wasn't created before the File transport initialized — confirm the `fs.mkdirSync` guard in `logger.ts` runs before `buildTransports()`. |
| Every scenario's logs are tagged with the same/wrong scenario name | The `Before` hook is populating `this.log` from the wrong hook argument — confirm how this project's Cucumber hooks actually expose the current scenario/pickle (varies by `@cucumber/cucumber` version) before wiring Step 5. |
| Log file grows unbounded across many CI runs | No rotation configured — this skill does not add rotation by default; add `winston-daily-rotate-file` as an extension if long-lived log retention matters to the project. |

## Files

- `.claude/skills/add-logger/SKILL.md` — this workflow
