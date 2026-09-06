#!/usr/bin/env node
/**
 * setup-cucumber-playwright / setup.mjs
 *
 * Project SCAFFOLDING ONLY for a Playwright + Cucumber-BDD + TypeScript
 * suite. Gets an empty directory (or an existing project) to the state the
 * `write-step-defs` skill / the `bdd-step-implementer` agent expect before
 * they run:
 *
 *   - package.json (written when the project has none) with the dev-deps
 *     (@cucumber/cucumber@13, @playwright/test, @types/node, tsx,
 *     typescript@next + @typescript/native-preview for TS 7, winston,
 *     @colors/colors, cross-env, npm-run-all) plus placeholder + per-engine
 *     (test:chromium/firefox/webkit/all) scripts
 *   - chromium + firefox + webkit installed
 *   - tsconfig.json (TS 7: module/moduleResolution nodenext, paths not
 *     baseUrl, for the step defs / page objects)
 *   - .vscode/settings.json + .vscode/extensions.json (editor + current
 *     cucumberautocomplete keys only)
 *   - .gitignore covering the generated / output dirs
 *   - a GitHub Actions workflow — a 3-engine matrix (opt-out with --no-ci)
 *
 * It writes NOTHING that write-step-defs owns:
 *   - cucumber.js / cucumber.cjs           -> scaffold.mjs --emit
 *   - src/support/world.ts, hooks.ts, data.ts -> scaffold.mjs --emit
 *   - *.feature / *.steps.ts / *.page.ts / base.page.ts / index.ts -> scaffold.mjs --emit
 *   - the REAL package.json "cucumberTs" / "cucumberTs:ci" scripts -> scaffold.mjs --emit
 *     (this script only seeds a placeholder "cucumberTs" that exits 1)
 *   - the winston logger / fixtures        -> the add-logger skill
 *
 * It does NOT drive a browser and does NOT call npm itself. It PLANS the
 * work and WRITES local config files, then prints the exact install +
 * next-step commands for the caller (the skill / the human) to run.
 *
 * Usage:
 *   node .claude/skills/setup-cucumber-playwright/setup.mjs [options]
 *
 * Options:
 *   --dir <path>        Target project root. Default: cwd.
 *   --plan             Print the detected state + planned actions, write nothing (default).
 *   --apply            Write the files.
 *   --force            Overwrite files this script owns even if they already exist.
 *   --no-ci            Skip the GitHub Actions workflow.
 *   --features-dir <p> Default: src/features   (tsconfig include only)
 *   --steps-dir <p>    Default: src/step-definitions
 *   --pages-dir <p>    Default: src/pages
 *   --support-dir <p>  Default: src/support
 *   --pm <npm|pnpm|yarn>  Force package manager (else detected from lockfile).
 *
 * Exit codes: 0 ok, 1 bad args / target problem.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';

// ---------------------------------------------------------------- args

const argv = process.argv.slice(2);
const opts = {
  dir: process.cwd(),
  plan: false,
  apply: false,
  force: false,
  ci: true,
  featuresDir: 'src/features',
  stepsDir: 'src/step-definitions',
  pagesDir: 'src/pages',
  supportDir: 'src/support',
  pm: null,
};

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const next = () => argv[++i];
  switch (a) {
    case '--dir': opts.dir = resolve(next()); break;
    case '--plan': opts.plan = true; break;
    case '--apply': opts.apply = true; break;
    case '--force': opts.force = true; break;
    case '--no-ci': opts.ci = false; break;
    case '--features-dir': opts.featuresDir = next(); break;
    case '--steps-dir': opts.stepsDir = next(); break;
    case '--pages-dir': opts.pagesDir = next(); break;
    case '--support-dir': opts.supportDir = next(); break;
    case '--pm': opts.pm = next(); break;
    case '-h': case '--help':
      console.log(readFileSync(new URL(import.meta.url)).toString().split('\n').slice(2, 50).join('\n').replace(/^ \*\/?$/gm, '').replace(/^ \* ?/gm, ''));
      process.exit(0);
    default:
      console.error(`Unknown option: ${a}`);
      process.exit(1);
  }
}
if (!opts.plan && !opts.apply) opts.plan = true; // default = dry run

const ROOT = opts.dir;
if (!existsSync(ROOT)) {
  console.error(`Target dir does not exist: ${ROOT}`);
  process.exit(1);
}

// ---------------------------------------------------------------- detect

const p = (...s) => join(ROOT, ...s);
const rd = (rel) => (existsSync(p(rel)) ? readFileSync(p(rel), 'utf8') : null);

const pkgRaw = rd('package.json');
const pkg = pkgRaw ? JSON.parse(pkgRaw) : null;
const hasPkg = !!pkg;

const isEmptyDir = readdirSync(ROOT).filter((f) => f !== '.claude' && f !== '.git').length === 0;

// package manager
let pm = opts.pm;
if (!pm) {
  if (pkg?.packageManager?.startsWith('pnpm')) pm = 'pnpm';
  else if (pkg?.packageManager?.startsWith('yarn')) pm = 'yarn';
  else if (existsSync(p('pnpm-lock.yaml'))) pm = 'pnpm';
  else if (existsSync(p('yarn.lock'))) pm = 'yarn';
  else pm = 'npm';
}
const pmRun = { npm: 'npx', pnpm: 'pnpm', yarn: 'yarn' }[pm];
const pmAdd = { npm: 'npm i -D', pnpm: 'pnpm add -D', yarn: 'yarn add -D' }[pm];
const pmInit = pm === 'npm' ? 'npm init -y' : pm === 'yarn' ? 'yarn init -y' : 'pnpm init';
const pmCi = pm === 'npm' ? 'npm ci' : pm === 'pnpm' ? 'pnpm install --frozen-lockfile' : 'yarn install --immutable';

// module system — a brand-new project we leave at npm's default (CommonJS);
// scaffold.mjs branches cucumber.js vs cucumber.cjs on package.json "type",
// so both are fine. We only report it.
const isESM = pkg?.type === 'module';

// existing deps
const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
const hasCucumber = '@cucumber/cucumber' in deps || existsSync(p('node_modules/@cucumber/cucumber'));
const hasPlaywright = '@playwright/test' in deps || existsSync(p('node_modules/@playwright/test'));
const hasTsx = 'tsx' in deps || existsSync(p('node_modules/tsx'));
const hasTypescript = 'typescript' in deps || existsSync(p('node_modules/typescript'));

const hasTsconfig = existsSync(p('tsconfig.json'));
const hasVscodeSettings = existsSync(p('.vscode/settings.json'));
const hasVscodeExtensions = existsSync(p('.vscode/extensions.json'));

// has write-step-defs already run here?
const cucumberConfig = ['cucumber.js', 'cucumber.cjs', 'cucumber.mjs', 'cucumber.json', 'cucumber.yaml']
  .find((n) => existsSync(p(n))) || null;
const hasWorld = existsSync(p(`${opts.supportDir}/world.ts`));

// ---------------------------------------------------------------- plan

/** @type {{path:string, why:string, write:()=>string, skipIfExists?:boolean, merge?:boolean}[]} */
const files = [];
/** @type {string[]} */
const notes = [];
/** @type {string[]} */
const installCmds = [];

// --- package.json (write a complete one when the project has none)
if (!hasPkg) {
  files.push({
    path: 'package.json',
    why: 'complete package.json for the Cucumber + Playwright + TS suite',
    skipIfExists: true,
    write: () => packageJsonTemplate(),
  });
}

// --- deps to install
const hasTypesNode = '@types/node' in deps || existsSync(p('node_modules/@types/node'));
const hasWinston = 'winston' in deps || existsSync(p('node_modules/winston'));
const hasColors = '@colors/colors' in deps || existsSync(p('node_modules/@colors/colors'));

const hasCrossEnv = 'cross-env' in deps || existsSync(p('node_modules/cross-env'));
const hasNpmRunAll = 'npm-run-all' in deps || existsSync(p('node_modules/npm-run-all'));

const toInstall = [];
if (!hasCucumber) toInstall.push('@cucumber/cucumber@13');
if (!hasPlaywright) toInstall.push('@playwright/test');
if (!hasTsx) toInstall.push('tsx');
if (!hasTypescript) toInstall.push('typescript');
if (!hasTypesNode) toInstall.push('@types/node');
if (!hasWinston) toInstall.push('winston');
if (!hasColors) toInstall.push('@colors/colors');
if (!hasCrossEnv) toInstall.push('cross-env');
if (!hasNpmRunAll) toInstall.push('npm-run-all');
if (!hasPkg) {
  // package.json is written by this script with the dev-deps already listed —
  // a plain install pulls them from it, no `npm init` and no `npm i -D` needed.
  installCmds.push(pm === 'npm' ? 'npm install' : pm === 'yarn' ? 'yarn install' : 'pnpm install');
} else if (toInstall.length) {
  installCmds.push(`${pmAdd} ${toInstall.join(' ')}`);
}
// All three engines — the suite runs cross-browser via BROWSER= / the CI matrix.
installCmds.push(`${pmRun} playwright install chromium firefox webkit`);

// --- tsconfig
files.push({
  path: 'tsconfig.json',
  why: hasTsconfig ? 'exists — left as-is (review manually)' : 'TypeScript config for step defs / page objects',
  skipIfExists: true,
  write: () => tsconfigTemplate(),
});

// --- CI
if (opts.ci) {
  files.push({
    path: '.github/workflows/bdd.yml',
    why: 'GitHub Actions — runs the Cucumber suite (needs write-step-defs to have run once)',
    skipIfExists: true,
    write: () => ciTemplate(),
  });
}

// --- .gitignore
files.push({
  path: '.gitignore',
  why: 'ignore generated / output dirs',
  merge: true,
  write: () => gitignoreLines(),
});

// --- .vscode/settings.json
files.push({
  path: '.vscode/settings.json',
  why: hasVscodeSettings ? 'exists — left as-is' : 'editor + cucumber step-completion config',
  skipIfExists: true,
  write: () => vscodeSettingsTemplate(),
});

// --- .vscode/extensions.json
files.push({
  path: '.vscode/extensions.json',
  why: 'recommended editor extensions (cucumberautocomplete, playwright, eslint, prettier)',
  skipIfExists: true,
  write: () => vscodeExtensionsTemplate(),
});

// --- next steps
notes.push(
  `This skill does project scaffolding only. To generate the runnable suite\n` +
  `     (cucumber.js, ${opts.supportDir}/world.ts + hooks.ts, page objects, step defs),\n` +
  `     run the write-step-defs skill next (or spawn the bdd-step-implementer agent):\n\n` +
  `       node .claude/skills/write-step-defs/scaffold.mjs --plan <feature-file> --base-url <url>\n` +
  `       # explore the site, write selmap.json, then:\n` +
  `       node .claude/skills/write-step-defs/scaffold.mjs --emit <feature-file> --base-url <url> \\\n` +
  `         --features-dir ${opts.featuresDir} --steps-dir ${opts.stepsDir} \\\n` +
  `         --pages-dir ${opts.pagesDir} --support-dir ${opts.supportDir}\n\n` +
  `     scaffold.mjs --emit also sets the package.json "cucumberTs" script and\n` +
  `     writes the cucumber config. Add the winston logger afterward with the\n` +
  `     add-logger skill (on a fresh scaffold: write-step-defs first, then add-logger).`
);

// ---------------------------------------------------------------- output

console.log(`\nsetup-cucumber-playwright  —  ${opts.plan ? 'PLAN (dry run)' : 'APPLY'}`);
console.log('='.repeat(60));
console.log(`target      : ${ROOT}`);
console.log(`state       : ${isEmptyDir ? 'empty dir (fresh scaffold)' : hasPkg ? 'existing project' : 'non-empty, no package.json'}`);
console.log(`pkg manager : ${pm}`);
console.log(`modules     : ${hasPkg ? (isESM ? 'ESM ("type":"module")' : 'CommonJS') : 'CommonJS (npm default for a fresh project)'}`);
console.log(`@cucumber/cucumber : ${hasCucumber ? 'present' : 'MISSING — will install (@13)'}`);
console.log(`@playwright/test   : ${hasPlaywright ? 'present' : 'MISSING — will install'}`);
console.log(`tsx               : ${hasTsx ? 'present' : 'MISSING — will install'}`);
console.log(`typescript        : ${hasTypescript ? 'present' : 'MISSING — will install'}`);
console.log(`@types/node        : ${hasTypesNode ? 'present' : 'MISSING — will install'}`);
console.log(`winston           : ${hasWinston ? 'present' : 'MISSING — will install (used by add-logger)'}`);
console.log(`@colors/colors     : ${hasColors ? 'present' : 'MISSING — will install (used by add-logger)'}`);
console.log(`cross-env         : ${hasCrossEnv ? 'present' : 'MISSING — will install (portable BROWSER= in scripts)'}`);
console.log(`npm-run-all       : ${hasNpmRunAll ? 'present' : 'MISSING — will install (run-s / run-p for test:all*)'}`);
console.log(`package.json      : ${hasPkg ? 'present — kept' : 'none — will create'}`);
console.log(`tsconfig.json     : ${hasTsconfig ? 'present — kept' : 'none — will create'}`);
console.log(`.vscode/settings.json : ${hasVscodeSettings ? 'present — kept' : 'none — will create'}`);
console.log(`.vscode/extensions.json : ${hasVscodeExtensions ? 'present — kept' : 'none — will create'}`);
console.log(`cucumber config   : ${cucumberConfig ? cucumberConfig + ' (write-step-defs already ran)' : 'none — write-step-defs will create it'}`);
console.log(`${opts.supportDir}/world.ts : ${hasWorld ? 'present' : 'none — write-step-defs will create it'}`);
console.log(`CI workflow       : ${opts.ci ? '.github/workflows/bdd.yml' : 'skipped (--no-ci)'}`);
console.log('='.repeat(60));

console.log('\nInstall / setup commands (run these yourself):');
if (installCmds.length === 0) console.log('  (nothing to install)');
installCmds.forEach((c) => console.log(`  $ ${c}`));

console.log('\nFiles:');
let wrote = 0, skipped = 0;
for (const f of files) {
  const abs = p(f.path);
  const exists = existsSync(abs);

  if (f.merge) {
    const cur = exists ? readFileSync(abs, 'utf8') : '';
    const add = f.write().split('\n').filter((l) => l && !cur.includes(l.trim()));
    if (add.length === 0) { console.log(`  =  ${f.path}  (already has entries)`); skipped++; continue; }
    console.log(`  ${opts.plan ? '+' : '✎'}  ${f.path}  (append ${add.length} line(s))  — ${f.why}`);
    if (opts.apply) {
      const body = (cur.trimEnd() + '\n' + add.join('\n') + '\n').replace(/^\n/, '');
      ensureDir(abs); writeFileSync(abs, body); wrote++;
    }
    continue;
  }

  if (exists && f.skipIfExists && !opts.force) {
    console.log(`  =  ${f.path}  (exists — skipped; --force to overwrite)  — ${f.why}`);
    skipped++;
    continue;
  }
  console.log(`  ${opts.plan ? '+' : '✔'}  ${f.path}  — ${f.why}`);
  if (opts.apply) { ensureDir(abs); writeFileSync(abs, f.write()); wrote++; }
}

if (notes.length) {
  console.log('\nNext:');
  notes.forEach((n, i) => console.log(`\n  ${i + 1}. ${n}`));
}

console.log('\nVerify (after install):');
console.log(`  $ ${pmRun} tsc -p tsconfig.json --noEmit   # tsconfig compiles (bare 'tsc' on TS 7 prints CLI help)`);
console.log(`  $ ${pmRun} playwright --version             # playwright present`);
console.log(`  $ ${pmRun} playwright install --dry-run     # chromium + firefox + webkit downloaded`);
console.log(`  (fresh scaffold: TS18003 'No inputs were found' is expected — src/ dirs`);
console.log(`   don't exist until write-step-defs emits the suite. Any other tsc error is real.)`);

if (opts.plan) {
  console.log('\n(plan only — re-run with --apply to write the files above)\n');
} else {
  console.log(`\nDone. ${wrote} written, ${skipped} skipped.\n`);
}

// ---------------------------------------------------------------- helpers

function ensureDir(absFile) {
  const d = dirname(absFile);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

// ---------------------------------------------------------------- templates

function packageJsonTemplate() {
  const base = require_basename(ROOT);
  return JSON.stringify({
    name: base,
    version: '0.1.0',
    private: true,
    description: 'Playwright + Cucumber-BDD + TypeScript suite',
    type: 'commonjs',
    scripts: {
      // scaffold.mjs --emit adds "cucumberTs" / "cucumberTs:ci"; these are
      // safe placeholders so `npm run` lists something meaningful meanwhile.
      test: 'npm run cucumberTs',
      cucumberTs: 'echo "run write-step-defs (scaffold.mjs --emit) to generate the suite" && exit 1',
      // Per-engine wrappers (cross-env so BROWSER= works on Windows too).
      // test:all runs them sequentially; test:all:parallel concurrently.
      'test:chromium': 'cross-env BROWSER=chromium npm run cucumberTs',
      'test:firefox': 'cross-env BROWSER=firefox npm run cucumberTs',
      'test:webkit': 'cross-env BROWSER=webkit npm run cucumberTs',
      'test:all': 'run-s test:chromium test:firefox test:webkit',
      'test:all:parallel': 'run-p test:chromium test:firefox test:webkit',
      // tsgo (TS 7 native) when present, classic tsc as fallback.
      'type-check': 'tsgo --noEmit || tsc -p tsconfig.json --noEmit',
      'pw:install': 'playwright install chromium firefox webkit',
    },
    devDependencies: {
      '@colors/colors': '^1.6.0',
      '@cucumber/cucumber': '^13.0.0',
      '@playwright/test': '^1.47.0',
      '@types/node': '^22.0.0',
      // TypeScript 7: the classic compiler's 7.0-dev line ("next") keeps
      // tsc + tsserver + editor language service working, while
      // @typescript/native-preview provides the Go-native `tsgo` binary.
      '@typescript/native-preview': 'latest',
      // cross-env: portable BROWSER=/PARALLEL= in the npm scripts (Windows).
      // npm-run-all: run-s / run-p for the test:all* scripts.
      'cross-env': '^10.1.0',
      'npm-run-all': '^4.1.5',
      tsx: '^4.19.0',
      typescript: 'next',
      winston: '^3.14.0',
    },
  }, null, 2) + '\n';
}

function require_basename(dir) {
  const parts = dir.split(/[\\/]/).filter(Boolean);
  return (parts[parts.length - 1] || 'bdd-suite').toLowerCase().replace(/[^a-z0-9._-]/g, '-');
}

function vscodeSettingsTemplate() {
  // Only settings verified current are emitted. Notably OMITTED:
  //   - typescript.enablePromptUseWorkspaceTsdk : VS Code prompts to trust
  //     the workspace tsdk automatically now; the explicit key is gone.
  //   - editor.quickSuggestions global override : discouraged; leave the
  //     editor default.
  //   - cucumberautocomplete formatting toggles (skipDocStringsFormat,
  //     onTypeFormat, pureTextSteps) : valid but opinionated; a scaffold
  //     shouldn't force them.
  // cucumberautocomplete keys below are all in the extension's current
  // README: https://github.com/alexkrechik/VSCucumberAutoComplete#settings
  return JSON.stringify({
    'editor.formatOnSave': true,
    'files.eol': '\n',
    // Point the editor's language service at the workspace TypeScript
    // (matters here because that's the TS 7 line, newer than VS Code's
    // bundled tsserver).
    'js/ts.tsdk.path': 'node_modules/typescript/lib',
    'cucumberautocomplete.steps': [
      `${opts.stepsDir}/**/*.ts`,
    ],
    'cucumberautocomplete.syncfeatures': `${opts.featuresDir}/**/*.feature`,
    'cucumberautocomplete.strictGherkinCompletion': true,
    'cucumberautocomplete.strictGherkinValidation': true,
    'cucumberautocomplete.smartSnippets': true,
    'cucumberautocomplete.stepsInvariants': true,
    'cucumberautocomplete.customParameters': [],
    'cucumberautocomplete.pages': {},
    '[feature]': {
      'editor.formatOnSave': true,
    },
  }, null, 2) + '\n';
}

function vscodeExtensionsTemplate() {
  return JSON.stringify({
    recommendations: [
      'alexkrechik.cucumberautocomplete',
      'ms-playwright.playwright',
      'dbaeumer.vscode-eslint',
      'esbenp.prettier-vscode',
    ],
  }, null, 2) + '\n';
}

function tsconfigTemplate() {
  return JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      // TypeScript 7 removed the `node`/`node10` resolver and the classic
      // `commonjs` module mode's old lookup. `nodenext` is the supported
      // pairing; cucumber-js runs the step files through tsx, which strips
      // types and resolves extensionless relative imports at runtime, so
      // this only governs type-checking.
      module: 'nodenext',
      moduleResolution: 'nodenext',
      lib: ['ES2022', 'DOM'],
      types: ['node'],
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      resolveJsonModule: true,
      noEmit: true,
      // TypeScript 7 removed `baseUrl`. `paths` with "./*" is the
      // replacement for anchoring bare `src/...` specifiers at the root.
      paths: { '*': ['./*'] },
    },
    include: [
      `${opts.stepsDir}/**/*.ts`,
      `${opts.pagesDir}/**/*.ts`,
      `${opts.supportDir}/**/*.ts`,
    ],
    exclude: ['node_modules', 'reports', 'test-results', 'playwright-report'],
  }, null, 2) + '\n';
}

function ciTemplate() {
  const runPm = pm === 'npm' ? 'npm' : pm;
  return `name: BDD

# Runs the Cucumber-BDD suite once per Playwright engine (matrix), each job
# with PARALLEL workers and the ci profile (retry 1). Assumes write-step-defs
# has run (cucumber config + world.ts + hooks + page objects + step defs) and
# package.json has a "cucumberTs" script.

on:
  push:
    branches: [main, master]
  pull_request:

jobs:
  bdd:
    timeout-minutes: 30
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        browser: [chromium, firefox, webkit]
    name: bdd (\${{ matrix.browser }})
    env:
      BROWSER: \${{ matrix.browser }}
      PARALLEL: 2
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
${pm === 'pnpm' ? '      - uses: pnpm/action-setup@v4\n' : ''}      - run: ${pmCi}
      - run: ${pmRun} playwright install --with-deps \${{ matrix.browser }}
      - run: ${runPm} run cucumberTs -- --profile ci
      - uses: actions/upload-artifact@v4
        if: ${'${{ !cancelled() }}'}
        with:
          name: cucumber-report-\${{ matrix.browser }}
          path: |
            reports/\${{ matrix.browser }}/
            logs/
          retention-days: 7
`;
}

function gitignoreLines() {
  return [
    'node_modules/',
    'reports/',
    'test-results/',
    'playwright-report/',
    'playwright/.cache/',
    '.claude/.scratch/',
    'logs/',
  ].join('\n') + '\n';
}
