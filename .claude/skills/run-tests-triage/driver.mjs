#!/usr/bin/env node
// Driver for the run-tests-triage skill.
//
// Runs the Cucumber-BDD suite, parses the JSON report, and for every failed
// scenario correlates the error back to the page-object locator that most
// likely broke. Report-only: never edits source files.
//
// Repo-agnostic. Nothing here assumes `src/features`, `src/support`,
// `src/step-definitions`, or a package.json script named "cucumberTs":
//   * feature / support / step dirs are DETECTED by globbing for the file
//     conventions (*.feature, world.ts|hooks.ts, *.steps.ts), overridable
//     with --features-dir / --support-dir / --steps-dir
//   * the run command is DETECTED from package.json "scripts" (any script
//     that invokes @cucumber/cucumber), falling back to the direct
//     `node --import tsx node_modules/@cucumber/cucumber/bin/cucumber.js`
//     incantation
//   * report + screenshots are written under .claude/.scratch/run-tests-triage/
//     (gitignored) so they never travel between repos
//
// Usage:
//   node .claude/skills/run-tests-triage/driver.mjs [options] [-- <extra cucumber-js args>]
//
//   --features-dir <dir>   override feature-file directory
//   --support-dir  <dir>   override support directory (world.ts / hooks.ts)
//   --steps-dir    <dir>   override step-definition directory
//   --root         <dir>   project root (default: cwd)
//
// Run from the project root, or pass --root.

import { spawnSync } from 'node:child_process';
import {
  readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync,
} from 'node:fs';
import { join, relative, dirname, sep } from 'node:path';

/* ----------------------------- arg parsing ----------------------------- */
const argv = process.argv.slice(2);
const dashDash = argv.indexOf('--');
const extraArgs = dashDash === -1 ? [] : argv.slice(dashDash + 1);
const flags = dashDash === -1 ? argv : argv.slice(0, dashDash);
const flag = (name, def) => {
  const i = flags.indexOf(`--${name}`);
  return i !== -1 && flags[i + 1] && !flags[i + 1].startsWith('--') ? flags[i + 1] : def;
};

const ROOT = flag('root', process.cwd());
const SCRATCH = join(ROOT, '.claude', '.scratch', 'run-tests-triage');
const REPORT_JSON = join(SCRATCH, 'cucumber-triage-report.json');
const SCREENSHOT_DIR = join(SCRATCH, 'triage-screenshots');

/* --------------------------- filesystem walk ------------------------- */
const PRUNE = new Set(['node_modules', '.git', 'dist', 'build', 'reports', '.claude']);
function walk(dir, test, out = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!PRUNE.has(e.name)) walk(join(dir, e.name), test, out);
    } else if (test(e.name)) {
      out.push(join(dir, e.name));
    }
  }
  return out;
}
/** most common parent directory of a list of files */
function commonDir(files) {
  if (!files.length) return null;
  const counts = new Map();
  for (const f of files) {
    const d = dirname(f);
    counts.set(d, (counts.get(d) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/* ------------------------------- detect ------------------------------ */
function detect() {
  const featureFiles = walk(ROOT, (n) => n.endsWith('.feature'));
  if (!featureFiles.length) {
    console.error(`[driver] no .feature files found under ${ROOT} — nothing to run.`);
    process.exit(2);
  }
  const stepFiles = walk(ROOT, (n) => /\.steps\.(ts|js|mjs|cjs)$/.test(n));
  const supportFiles = walk(ROOT, (n) => /^(world|hooks)\.(ts|js|mjs|cjs)$/.test(n));

  const featuresDir = flag('features-dir', commonDir(featureFiles)) || dirname(featureFiles[0]);
  const stepsDir = flag('steps-dir', commonDir(stepFiles) || featuresDir);
  const supportDir = flag('support-dir', commonDir(supportFiles) || stepsDir);

  return {
    featuresDir, stepsDir, supportDir,
    // TS anywhere in the import globs => we need the tsx loader
    needsTsx: [...stepFiles, ...supportFiles].some((f) => f.endsWith('.ts')),
  };
}

/** the command that runs cucumber, from package.json scripts or the fallback */
function detectRunCommand(needsTsx) {
  const pkgPath = join(ROOT, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const scripts = JSON.parse(readFileSync(pkgPath, 'utf-8')).scripts || {};
      for (const [name, body] of Object.entries(scripts)) {
        if (/@cucumber\/cucumber/.test(body)) {
          return { kind: 'npm', argv: ['run', name, '--'], display: `npm run ${name} --` };
        }
      }
    } catch { /* fall through */ }
  }
  const bin = join('node_modules', '@cucumber', 'cucumber', 'bin', 'cucumber.js');
  const base = needsTsx ? ['--import', 'tsx', bin] : [bin];
  return { kind: 'node', argv: base, display: `node ${base.join(' ')}` };
}

/* -------------------------------- run -------------------------------- */
function run() {
  const { featuresDir, stepsDir, supportDir, needsTsx } = detect();
  mkdirSync(SCRATCH, { recursive: true });

  const rel = (p) => relative(ROOT, p).split(sep).join('/');
  const cmd = detectRunCommand(needsTsx);

  const cucumberArgs = [
    '--import', `${rel(supportDir)}/**/*.${needsTsx ? 'ts' : 'js'}`,
    '--import', `${rel(stepsDir)}/**/*.${needsTsx ? 'ts' : 'js'}`,
    `${rel(featuresDir)}/**/*.feature`,
    '--format', `json:${rel(REPORT_JSON)}`,
    '--format', 'summary',
    ...extraArgs,
  ];

  let exe, fullArgs;
  if (cmd.kind === 'npm') {
    exe = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    fullArgs = [...cmd.argv, ...cucumberArgs];
  } else {
    exe = 'node';
    fullArgs = [...cmd.argv, ...cucumberArgs];
  }

  console.log(`[driver] detected: features=${rel(featuresDir)}  steps=${rel(stepsDir)}  support=${rel(supportDir)}`);
  console.log(`[driver] running: ${exe} ${fullArgs.join(' ')}`);
  const result = spawnSync(exe, fullArgs, { cwd: ROOT, stdio: 'inherit', encoding: 'utf-8' });

  if (!existsSync(REPORT_JSON)) {
    console.error(`[driver] no report produced at ${REPORT_JSON} — cucumber likely crashed before writing output.`);
    console.error(`[driver] re-run the command above directly to see the raw crash.`);
    process.exit(result.status ?? 1);
  }

  triage(REPORT_JSON);
  process.exit(result.status ?? 0);
}

/* ------------------------------ triage ------------------------------- */
function triage(reportPath) {
  const features = JSON.parse(readFileSync(reportPath, 'utf-8'));
  const failures = [];

  for (const feature of features) {
    const featureFile = feature.uri;
    for (const el of feature.elements ?? []) {
      if (el.type === 'background') continue;
      const failedStep = el.steps?.find((s) => s.result?.status === 'failed');
      if (!failedStep) continue;

      const screenshot = extractScreenshot(el, `${slug(el.name)}-${el.line}`);
      failures.push({
        scenario: el.name,
        scenarioLine: el.line,
        featureFile,
        step: failedStep.name,
        stepLine: failedStep.line,
        stepDefLocation: failedStep.match?.location ?? null,
        error: failedStep.result.error_message ?? '(no error_message on failure)',
        screenshot,
      });
    }
  }

  if (failures.length === 0) {
    const total = features.reduce(
      (n, f) => n + (f.elements?.filter((e) => e.type !== 'background').length ?? 0), 0);
    console.log(`\n[triage] all ${total} scenario(s) passed. Nothing to triage.`);
    return;
  }

  console.log(`\n[triage] ${failures.length} failed scenario(s):\n`);
  for (const f of failures) printFailure(f);
}

function extractScreenshot(el, baseName) {
  const afterHook = el.steps?.find((s) => s.hidden && s.embeddings?.length);
  const embedding = afterHook?.embeddings?.find((e) => e.mime_type === 'image/png');
  if (!embedding) return null;
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const file = join(SCREENSHOT_DIR, `${baseName}.png`);
  writeFileSync(file, Buffer.from(embedding.data, 'base64'));
  return relative(ROOT, file);
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Pull "at <fn> (path:line:col)" frames out of a stack trace and keep only
// frames inside the project's own source (not node_modules) — that's where
// the broken locator or assertion actually lives.
function extractSourceFrames(errorMessage) {
  const frames = [];
  const re = /at .*?\(([^)]+\.(?:ts|js|mjs|cjs)):(\d+):(\d+)\)/g;
  let m;
  while ((m = re.exec(errorMessage))) {
    const file = m[1].replace(/\\/g, '/');
    if (!file.includes('/node_modules/')) {
      const shortIdx = file.lastIndexOf('/src/') !== -1 ? file.lastIndexOf('/src/') + 1 : 0;
      frames.push({ file: shortIdx ? file.slice(shortIdx) : file, line: m[2], col: m[3] });
    }
  }
  return frames;
}

function classify(errorMessage) {
  if (/Timeout \d+ms exceeded/.test(errorMessage) && /waiting for/.test(errorMessage)) {
    return { cause: 'selector drift', detail: 'The locator never resolved on the live page. The selector text/role/placeholder probably changed or the element was removed.' };
  }
  if (/strict mode violation/.test(errorMessage)) {
    return { cause: 'locator no longer unique', detail: 'The locator now matches more than one element. Narrow it (.first(), a more specific role/name, or a test id).' };
  }
  if (/toHaveURL/.test(errorMessage)) {
    return { cause: 'page-path drift', detail: 'An expectPage()-style assertion failed — the live URL fragment no longer matches the page-name map entry.' };
  }
  if (/toBeVisible/.test(errorMessage) && /getByText/.test(errorMessage)) {
    return { cause: 'expected-text drift', detail: 'An expectText()-style assertion failed — the expected message string no longer appears (site copy changed, or timing).' };
  }
  if (/net::|ERR_|ECONNREFUSED|ENOTFOUND/.test(errorMessage)) {
    return { cause: 'network/site availability', detail: 'Not a locator issue — the page/request never loaded. Check baseUrl, connectivity, or a request-blocking route in the World.' };
  }
  return { cause: 'uncategorized', detail: 'Error text did not match a known pattern — inspect the full error_message above.' };
}

function printFailure(f) {
  const frames = extractSourceFrames(f.error);
  const { cause, detail } = classify(f.error);
  console.log(`Scenario: ${f.scenario}  (${f.featureFile}:${f.scenarioLine})`);
  console.log(`Failed step: ${f.step}  (line ${f.stepLine})`);
  if (f.stepDefLocation) console.log(`Step definition: ${f.stepDefLocation}`);
  console.log(`Error: ${f.error.split('\n')[0]}`);
  console.log(`Likely cause: ${cause} - ${detail}`);
  if (frames.length) {
    console.log('Implicated source location(s):');
    for (const fr of frames) console.log(`  - ${fr.file}:${fr.line}:${fr.col}`);
  } else {
    console.log('Implicated source location(s): none found in stack trace (see raw error above)');
  }
  if (f.screenshot) console.log(`Screenshot: ${f.screenshot}`);
  console.log('');
}

run();
