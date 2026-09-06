#!/usr/bin/env node
/**
 * scaffold.mjs — emit Cucumber + Playwright step definitions (TypeScript,
 * Page Object Model) for .feature files.
 *
 * This script does NOT touch a browser and does NOT guess selectors.
 * The agent drives the real site (via the claude-in-chrome MCP tools),
 * discovers the real selectors and landing URLs, writes them into a
 * `selmap.json`, and this script bakes them into the generated code.
 *
 * Two modes:
 *
 *   --plan   FEATURE...            print JSON describing what the agent must
 *                                  explore on the live site: every distinct
 *                                  action, its data-table field keys, every
 *                                  page name used in assertions.
 *
 *   --emit   FEATURE... --selmap S write the suite from the .feature files +
 *                                  the agent's selmap.json. Step assertions
 *                                  come from the .feature text AS WRITTEN —
 *                                  if the site disagrees at run time, the
 *                                  test fails. That is the point.
 *
 * Never overwrites an existing file (world.ts / hooks.ts / cucumber.js /
 * *.page.ts / *.steps.ts). An existing Page Object is reused; a step
 * already defined anywhere in steps-dir is not re-emitted.
 *
 * ---------------------------------------------------------------------------
 *   node .claude/skills/write-step-defs/scaffold.mjs --plan src/features/login.feature
 *   node .claude/skills/write-step-defs/scaffold.mjs --emit src/features/login.feature \
 *        --selmap .claude/.scratch/write-step-defs/selmap.json --base-url https://www.saucedemo.com
 *
 *   The selmap the agent produces belongs in the gitignored per-repo
 *   scratch area, NOT inside this skill folder — that keeps the folder
 *   portable. Default: .claude/.scratch/write-step-defs/selmap.json
 *
 *   --features-dir <dir>   default src/features
 *   --steps-dir <dir>      default src/step-definitions
 *   --pages-dir <dir>      default src/pages
 *   --support-dir <dir>    default src/support
 *   --base-url <url>       baked into world.ts (env BASE_URL still wins)
 *   --dry-run              (emit) print the plan of files, write nothing
 *
 * Exit codes: 0 ok, 2 bad args / no features / bad selmap.
 * ---------------------------------------------------------------------------
 */
import { Parser, AstBuilder, GherkinClassicTokenMatcher } from '@cucumber/gherkin';
import { IdGenerator } from '@cucumber/messages';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, basename, relative, resolve } from 'node:path';

/* ------------------------------ arg parsing ------------------------------ */
const argv = process.argv.slice(2);
const BOOL_FLAGS = new Set(['plan', 'emit', 'dry-run']);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
};
const flag = (name) => argv.includes(`--${name}`);
const positional = (() => {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok.startsWith('--')) {
      if (!BOOL_FLAGS.has(tok.slice(2))) i++;
      continue;
    }
    out.push(tok);
  }
  return out;
})();

const MODE = flag('plan') ? 'plan' : flag('emit') ? 'emit' : null;
if (!MODE) {
  console.error('ERROR: pass --plan or --emit. See the header of this file.');
  process.exit(2);
}
const FEATURES_DIR = String(opt('features-dir', 'src/features'));
const STEPS_DIR = String(opt('steps-dir', 'src/step-definitions'));
const PAGES_DIR = String(opt('pages-dir', 'src/pages'));
const SUPPORT_DIR = String(opt('support-dir', 'src/support'));
const BASE_URL = opt('base-url', '');
const SELMAP_PATH = opt('selmap', '.claude/.scratch/write-step-defs/selmap.json');
const DRY = flag('dry-run');

/* --------------------------- collect feature files ---------------------- */
function expandFeatures(list) {
  const out = [];
  if (!list.length) {
    if (existsSync(FEATURES_DIR))
      for (const f of readdirSync(FEATURES_DIR))
        if (f.endsWith('.feature')) out.push(resolve(join(FEATURES_DIR, f)));
    return out;
  }
  for (const item of list) {
    if (item.includes('*')) {
      const dir = dirname(item);
      const pat = basename(item).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      const re = new RegExp(`^${pat}$`);
      if (existsSync(dir))
        for (const f of readdirSync(dir))
          if (re.test(f) && f.endsWith('.feature')) out.push(resolve(join(dir, f)));
    } else if (existsSync(item) && item.endsWith('.feature')) {
      out.push(resolve(item));
    }
  }
  return [...new Set(out)];
}
const featureFiles = expandFeatures(positional);
if (!featureFiles.length) {
  console.error(`ERROR: no .feature files found (looked in ${FEATURES_DIR})`);
  process.exit(2);
}

/* ------------------------------ gherkin parse -------------------------- */
const parser = new Parser(new AstBuilder(IdGenerator.uuid()), new GherkinClassicTokenMatcher());
function parseFeature(path) {
  try {
    return parser.parse(readFileSync(path, 'utf8')).feature;
  } catch (e) {
    console.error(`ERROR: ${relative(process.cwd(), path)} — Gherkin parse failed:\n${e.message}`);
    process.exit(2);
  }
}

/* ------------------------------ helpers ------------------------------- */
const KW_CONT = new Set(['And', 'But', '*']);
function camel(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^(\d)/, '_$1');
}
function pascal(s) {
  const c = camel(s);
  return c.charAt(0).toUpperCase() + c.slice(1);
}
function featureSlug(path) {
  return basename(path, '.feature').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
}
/** step text -> cucumber expression + ordered param types */
function toExpression(text) {
  const params = [];
  let expr = text.replace(/"([^"]*)"/g, () => (params.push('string'), '{string}'));
  expr = expr.replace(/<([^>]+)>/g, () => (params.push('string'), '{string}'));
  expr = expr.replace(/(?<![\w<{])[-+]?\d+(?![\w>}])/g, () => (params.push('int'), '{int}'));
  return { expr, params };
}
function argNames(params) {
  const seen = {};
  return params.map((p) => {
    const base = p === 'int' ? 'n' : 'value';
    seen[base] = (seen[base] || 0) + 1;
    return seen[base] === 1 ? base : `${base}${seen[base]}`;
  });
}
const tsType = (p) => (p === 'int' ? 'number' : 'string');
/** strip quotes / <placeholders> so the same action phrased with different
 *  data collapses to one label */
const actionLabel = (text) =>
  text.replace(/"[^"]*"/g, '""').replace(/<[^>]+>/g, '<>').replace(/\s+/g, ' ').trim();

/* --------------------- walk a feature into a model ------------------- */
function modelFeature(path) {
  const feature = parseFeature(path);
  const slug = featureSlug(path);
  const children = feature?.children || [];
  const bg = children.find((c) => c.background)?.background;
  const scenarios = children.filter((c) => c.scenario).map((c) => c.scenario);

  const groups = [];
  if (bg) groups.push(bg.steps || []);
  for (const s of scenarios) groups.push(s.steps || []);

  const steps = new Map(); // `${kw}::${expr}` -> {keyword, expr, params, hasTable, sampleText}
  const actions = new Map(); // label -> {method, hasTable, tableKeys:Set, sampleValues:{}}
  const pageNames = new Set();

  // example values for outline placeholders, to fill during exploration
  const exampleRows = [];
  for (const s of scenarios)
    for (const ex of s.examples || []) {
      const header = ex.tableHeader?.cells.map((c) => c.value) || [];
      for (const r of ex.tableBody || []) {
        const row = {};
        r.cells.forEach((c, i) => (row[header[i]] = c.value));
        exampleRows.push(row);
      }
    }

  for (const group of groups) {
    let last = 'Given';
    for (const st of group) {
      const kwRaw = st.keyword.trim();
      const kw = KW_CONT.has(kwRaw) ? last : kwRaw;
      if (!KW_CONT.has(kwRaw)) last = kwRaw;
      const { expr, params } = toExpression(st.text);
      const hasTable = !!st.dataTable;
      const key = `${kw}::${expr}`;
      if (!steps.has(key))
        steps.set(key, { keyword: kw, expr, params, hasTable, sampleText: st.text });

      if (kw === 'When') {
        const label = actionLabel(st.text);
        const a =
          actions.get(label) ||
          { method: camel(label) || 'act', hasTable, tableKeys: new Set(), sampleValues: {} };
        if (st.dataTable) {
          for (const row of st.dataTable.rows) {
            const [k, v = ''] = row.cells.map((c) => c.value);
            a.tableKeys.add(k);
            // resolve <placeholder> to the first example value we have
            let val = v;
            const ph = /^<(.+)>$/.exec(v);
            if (ph) val = exampleRows.find((r) => r[ph[1]] !== undefined)?.[ph[1]] ?? '';
            if (a.sampleValues[k] === undefined) a.sampleValues[k] = val;
          }
        }
        actions.set(label, a);
      }
      if (kw === 'Then') {
        const m = /"([^"]+)"\s*(page|screen|view)\b/i.exec(st.text) || /reach(?:es)?\s+(?:the\s+)?"([^"]+)"/i.exec(st.text);
        if (m) pageNames.add(m[1]);
      }
    }
  }

  return {
    path,
    slug,
    name: feature?.name || slug,
    className: `${pascal(slug)}Page`,
    prop: camel(slug) || 'page',
    steps: [...steps.values()],
    actions: [...actions.entries()].map(([label, a]) => ({
      label,
      method: a.method,
      hasTable: a.hasTable,
      fields: [...a.tableKeys],
      sampleValues: a.sampleValues,
    })),
    pageNames: [...pageNames],
  };
}

const models = featureFiles.map(modelFeature);

/* ================================ PLAN ============================== */
if (MODE === 'plan') {
  const plan = {
    baseUrl: BASE_URL && BASE_URL !== true ? String(BASE_URL) : null,
    note:
      'Drive the live site with the claude-in-chrome MCP tools. For each action below, ' +
      'navigate to baseUrl, locate each field, fill the sampleValues, click the submit ' +
      'control, and record a locator for every field + the submit + each page URL. ' +
      'PREFER a user-facing locator spec (see "locatorSpec" below): getByRole/getByLabel/' +
      'getByPlaceholder/getByText, or getByTestId when the site has a stable test-id attr. ' +
      'Fall back to a raw CSS string ONLY when the markup exposes no such handle. ' +
      'If the test-id attribute is not "data-testid" (e.g. "data-qa", "data-test"), set ' +
      '"testIdAttribute" at the top level of selmap.json. ' +
      'Write the result to .claude/.scratch/write-step-defs/selmap.json (the per-repo ' +
      'gitignored scratch area, NOT the skill folder) in the shape shown under "selmapShape". ' +
      'That path is also the --emit default, so `--emit` needs no --selmap flag if you use it.',
    selmapPath: '.claude/.scratch/write-step-defs/selmap.json',
    features: models.map((m) => ({
      feature: relative(process.cwd(), m.path),
      pageClass: m.className,
      pageProp: m.prop,
      actions: m.actions.map((a) => ({
        method: a.method,
        label: a.label,
        fields: a.fields,
        sampleValues: a.sampleValues,
        needsSubmitSelector: true,
      })),
      pageNames: m.pageNames,
    })),
    selmapShape: {
      testIdAttribute: '<OPTIONAL — omit unless the site\'s test-id attr is not "data-testid", e.g. "data-qa">',
      pages: {
        '<pageClass>': {
          url: '<observed URL or path fragment for the page it opens on, e.g. "/" >',
          fields: { '<data-table key>': '<locatorSpec — see below>' },
          submit: { '<method name>': '<locatorSpec for that action\'s submit control>' },
        },
      },
      pagePaths: { '<page name used in a Then step>': '<url fragment, e.g. /inventory.html>' },
    },
    locatorSpec:
      'PREFERRED (an object → a user-facing Playwright locator): ' +
      '{"role":"button","name":"Sign up"} → getByRole(\'button\', { name: \'Sign up\' }); ' +
      '{"label":"Password"} → getByLabel(\'Password\'); ' +
      '{"placeholder":"Email Address"} → getByPlaceholder(\'Email Address\'); ' +
      '{"text":"Continue"} → getByText(\'Continue\'); ' +
      '{"altText":"..."} / {"title":"..."} → getByAltText / getByTitle; ' +
      '{"testId":"signup-email"} → getByTestId(\'signup-email\'). ' +
      'Optional refiners on any of those: "exact":true, "nth":0|"first"|"last", "filterText":"...". ' +
      'LAST RESORT: a bare "css string" or {"css":"..."} / {"xpath":"..."} → page.locator(...). ' +
      'Use a raw selector only when there is genuinely no role/label/placeholder/text/test-id handle.',
  };
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

/* ================================ EMIT ============================== */
if (SELMAP_PATH === true) {
  console.error('ERROR: --selmap needs a path value');
  process.exit(2);
}
let selmap;
try {
  selmap = JSON.parse(readFileSync(String(SELMAP_PATH), 'utf8'));
} catch (e) {
  console.error(`ERROR: cannot read selmap at ${SELMAP_PATH}: ${e.message}`);
  console.error('Run --plan first, drive the site, and write the selmap there');
  console.error('(default: .claude/.scratch/write-step-defs/selmap.json), or pass --selmap <path>.');
  process.exit(2);
}
selmap.pages ||= {};
selmap.pagePaths ||= {};

const planned = [];
function emit(path, content) {
  const rel = relative(process.cwd(), path);
  if (existsSync(path)) {
    planned.push({ path: rel, status: 'exists — left untouched' });
    return false;
  }
  if (DRY) {
    planned.push({ path: rel, status: 'would write' });
    return false;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  planned.push({ path: rel, status: 'written' });
  return true;
}

/* ------------------------------ templates --------------------------- */
function worldTs() {
  const base = BASE_URL && BASE_URL !== true ? String(BASE_URL) : '';
  const testIdAttr = typeof selmap.testIdAttribute === 'string' ? selmap.testIdAttribute : '';
  const testIdLine = testIdAttr
    ? `\n// This site tags elements with "${testIdAttr}", not the default "data-testid";\n// point Playwright's getByTestId() at it so the generated locators resolve.\nselectors.setTestIdAttribute(${JSON.stringify(testIdAttr)});\n`
    : '';
  return `import { setWorldConstructor, World, IWorldOptions } from '@cucumber/cucumber';
import { Browser, BrowserContext, Page, chromium, firefox, webkit${testIdAttr ? ', selectors' : ''} } from '@playwright/test';
import { PageObjects, buildPageObjects } from '../pages/index.js';
${testIdLine}

/** Custom Cucumber World — one instance per scenario. */
export class PlaywrightWorld extends World {
  browser!: Browser;
  context!: BrowserContext;
  page!: Page;
  pages!: PageObjects;

  readonly baseUrl: string;
  readonly browserName: 'chromium' | 'firefox' | 'webkit';
  readonly headless: boolean;

  /** Scratch state shared between the steps of one scenario. Set in a When,
   *  read in a later step. Reset per scenario (new World instance each time).
   *  \`forcedSignupEmail\` — a precondition hook can pin an address that already
   *  has an account so the "duplicate" step submits it verbatim.
   *  \`lastSignupEmail\` — the address the signup step actually used, for a
   *  later login / delete step to reuse. Add more fields as scenarios need. */
  forcedSignupEmail?: string;
  lastSignupEmail?: string;

  constructor(options: IWorldOptions) {
    super(options);
    this.baseUrl = process.env.BASE_URL ?? ${base ? JSON.stringify(base) : `'http://localhost:3000'`};
    this.browserName = (process.env.BROWSER as 'chromium' | 'firefox' | 'webkit') ?? 'chromium';
    this.headless = process.env.HEADED ? false : true;
  }

  private engine() {
    return this.browserName === 'firefox' ? firefox : this.browserName === 'webkit' ? webkit : chromium;
  }

  async init(): Promise<void> {
    this.browser = await this.engine().launch({ headless: this.headless });
    this.context = await this.browser.newContext({
      baseURL: this.baseUrl,
      viewport: { width: 1280, height: 800 },
    });

    // Block third-party ad / analytics traffic. It only adds noise (and, with
    // Google's "vignette" interstitial, can hijack navigation and slow the
    // page under test); it is never what a feature asserts about the site.
    await this.context.route('**/*', (route) => {
      const url = route.request().url();
      const blocked = [
        'googlesyndication.com', 'googleadservices.com', 'doubleclick.net',
        'google-analytics.com', 'googletagmanager.com', 'googletagservices.com',
        'adservice.google.', 'pagead2.googlesyndication', 'partner.googleadservices',
      ];
      return blocked.some((b) => url.includes(b)) ? route.abort() : route.continue();
    });

    this.page = await this.context.newPage();
    this.pages = buildPageObjects(this.page, this.baseUrl);
  }

  async destroy(): Promise<void> {
    await this.page?.close().catch(() => {});
    await this.context?.close().catch(() => {});
    await this.browser?.close().catch(() => {});
  }
}

setWorldConstructor(PlaywrightWorld);
`;
}

function dataTs() {
  return `import { faker } from '@faker-js/faker';

/**
 * Run-time test data helpers.
 *
 * A .feature file often hard-codes values that must be globally unique for the
 * scenario to pass — a registration e-mail, a username, an order reference.
 * Those only work on a FIRST run; the second run collides ("already exists").
 * The .feature stays the spec; the step code swaps the literal for a fresh
 * value from here, keeping any readable prefix so the created record is still
 * recognisable.
 *
 * A scenario that specifically needs a value that ALREADY exists (e.g.
 * "duplicate e-mail is rejected") is handled by a name-scoped Before hook in
 * support/<feature>.hooks.ts that creates the record and pins its value on the
 * World (this.forcedSignupEmail = ...); the step then submits that verbatim.
 */

/** A unique, valid e-mail. If \`seed\` is a plain address its local-part
 *  (before the "@") is kept and a Date.now()+faker token is appended as an
 *  extra dotted segment: \`a.b.c@example.com\` -> \`a.b.c.1a2b3c4d@example.com\`
 *  (dotted, not "+tag", so servers that reject plus-addressing still accept
 *  it). Otherwise a fully random address is returned. */
export function uniqueEmail(seed?: string): string {
  const token = \`\${Date.now().toString(36)}\${faker.string.alphanumeric(6).toLowerCase()}\`;
  const m = seed && /^([^@\\s]+)@([^@\\s]+)$/.exec(seed.trim());
  if (m) return \`\${m[1]}.\${token}@\${m[2]}\`;
  return \`qa.\${token}@example.com\`;
}

/** A random but realistic person name. */
export function personName(): { first: string; last: string; full: string } {
  const first = faker.person.firstName();
  const last = faker.person.lastName();
  return { first, last, full: \`\${first} \${last}\` };
}
`;
}

function hooksTs() {
  return `import {
  Before, After, BeforeAll, AfterAll, Status, setDefaultTimeout, ITestCaseHookParameter,
} from '@cucumber/cucumber';
import { PlaywrightWorld } from './world.js';

setDefaultTimeout(60_000);

BeforeAll(async function () {
  // suite-wide setup
});

Before(async function (this: PlaywrightWorld) {
  await this.init();
});

After(async function (this: PlaywrightWorld, scenario: ITestCaseHookParameter) {
  if (scenario.result?.status === Status.FAILED && this.page) {
    this.attach(await this.page.screenshot({ fullPage: true }), 'image/png');
  }
  await this.destroy();
});

AfterAll(async function () {
  // suite-wide teardown
});
`;
}

function cucumberJs() {
  const s = relative(process.cwd(), STEPS_DIR).replace(/\\/g, '/');
  const su = relative(process.cwd(), SUPPORT_DIR).replace(/\\/g, '/');
  const f = relative(process.cwd(), FEATURES_DIR).replace(/\\/g, '/');
  return `// Cucumber profiles. Run:  npm run cucumberTs
// One scenario:  npm run cucumberTs -- --name "<name>"
// CI profile:    npm run cucumberTs -- --profile ci
const common = {
  import: ['${su}/**/*.ts', '${s}/**/*.ts'],
  paths: ['${f}/**/*.feature'],
  format: ['summary', 'progress-bar', 'html:reports/cucumber-report.html'],
  formatOptions: { snippetInterface: 'async-await' },
  publishQuiet: true,
};
module.exports = {
  default: common,
  ci: { ...common, format: ['summary', 'html:reports/cucumber-report.html', 'junit:reports/junit.xml'], retry: 1, parallel: 2 },
};
`;
}

function pagePathsLiteral() {
  const entries = { ...selmap.pagePaths };
  // also fold in any page-level url the agent recorded, keyed by lowercased class-less name
  for (const [cls, p] of Object.entries(selmap.pages)) {
    if (p.url) {
      const nm = cls.replace(/Page$/, '').toLowerCase();
      if (entries[nm] === undefined) entries[nm] = p.url;
    }
  }
  const body = Object.entries(entries)
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
    .join('\n');
  return `export const PAGE_PATHS: Record<string, string> = {\n${body || ''}\n};`;
}

function basePageTs() {
  return `import { Page, Locator, expect } from '@playwright/test';

/** Web-first assertion timeout. The 5s Playwright default is often too tight
 *  for a form POST + redirect on a slow shared host. Override with
 *  process.env.UI_TIMEOUT (ms) if a site needs more or less. */
export const UI_TIMEOUT = Number(process.env.UI_TIMEOUT) || 15_000;

/** Gherkin page-name -> URL fragment. Filled from what the agent observed
 *  on the live site while scaffolding. Add entries as new page names appear. */
${pagePathsLiteral()}

export abstract class BasePage {
  constructor(
    protected readonly page: Page,
    protected readonly baseUrl: string,
  ) {}

  async open(path = '/'): Promise<void> {
    await this.page.goto(path);
  }

  /** Assert the current URL matches the named page (or a raw fragment). */
  async expectPage(pageNameOrFragment: string): Promise<void> {
    const frag = PAGE_PATHS[pageNameOrFragment] ?? pageNameOrFragment;
    if (frag === '/' || frag === '') {
      await expect(this.page).toHaveURL(new RegExp(escapeRegExp(this.baseUrl) + '/?$'), { timeout: UI_TIMEOUT });
      return;
    }
    await expect(this.page).toHaveURL(new RegExp(escapeRegExp(frag)), { timeout: UI_TIMEOUT });
  }

  async expectText(text: string): Promise<void> {
    await expect(this.page.getByText(text, { exact: false }).first()).toBeVisible({ timeout: UI_TIMEOUT });
  }

  locator(selector: string): Locator {
    return this.page.locator(selector);
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
}
`;
}

function pagesIndexTs(pageClasses) {
  const imp = pageClasses.map((p) => `import { ${p.className} } from './${p.slug}.page.js';`).join('\n');
  const fields = pageClasses.map((p) => `  ${p.prop}: ${p.className};`).join('\n');
  const inits = pageClasses.map((p) => `    ${p.prop}: new ${p.className}(page, baseUrl),`).join('\n');
  return `import { Page } from '@playwright/test';
${imp}

export interface PageObjects {
${fields}
}

export function buildPageObjects(page: Page, baseUrl: string): PageObjects {
  return {
${inits}
  };
}
`;
}

/**
 * Turn a selmap locator spec into a Playwright locator expression string
 * (the part after `this.page.` / `this.`).
 *
 * RECOMMENDED — a plain object picks a user-facing locator:
 *   { "role": "button", "name": "Sign up" }   -> getByRole('button', { name: 'Sign up' })
 *   { "label": "Password" }                    -> getByLabel('Password')
 *   { "placeholder": "Email Address" }         -> getByPlaceholder('Email Address')
 *   { "text": "Continue" }                     -> getByText('Continue')
 *   { "altText": "logo" } / { "title": "..." } -> getByAltText / getByTitle
 *   { "testId": "signup-email" }               -> getByTestId('signup-email')
 * Optional refiners on any of the above:
 *   "exact": true            -> { exact: true } in the options bag
 *   "nth": 0 | "first" | "last"  -> .nth(0) / .first() / .last()
 *   "filterText": "..."      -> .filter({ hasText: '...' }) before nth
 *
 * LAST RESORT — a bare string, or { "css": "..." } / { "xpath": "..." }, emits
 * page.locator(...). Use only when the markup exposes no user-facing handle.
 */
function locatorExpr(spec, ctx) {
  const bad = (msg) => {
    ctx.missing.push(msg);
    return null;
  };
  if (spec == null) return bad(ctx.label ? `${ctx.label} (no locator in selmap.json)` : 'locator');
  if (typeof spec === 'string') return `page.locator(${JSON.stringify(spec)})`;
  if (typeof spec !== 'object') return bad(`${ctx.label}: locator spec must be a string or object`);

  const optBag = spec.exact ? `{ exact: true }` : null;
  let base;
  if (spec.css) base = `page.locator(${JSON.stringify(spec.css)})`;
  else if (spec.xpath) base = `page.locator(${JSON.stringify('xpath=' + String(spec.xpath).replace(/^xpath=/, ''))})`;
  else if (spec.testId != null) base = `page.getByTestId(${JSON.stringify(spec.testId)})`;
  else if (spec.role != null) {
    const roleOpts = [];
    if (spec.name != null) roleOpts.push(`name: ${JSON.stringify(spec.name)}`);
    if (spec.exact) roleOpts.push(`exact: true`);
    base = `page.getByRole(${JSON.stringify(spec.role)}${roleOpts.length ? `, { ${roleOpts.join(', ')} }` : ''})`;
  } else if (spec.label != null) base = `page.getByLabel(${JSON.stringify(spec.label)}${optBag ? `, ${optBag}` : ''})`;
  else if (spec.placeholder != null) base = `page.getByPlaceholder(${JSON.stringify(spec.placeholder)}${optBag ? `, ${optBag}` : ''})`;
  else if (spec.text != null) base = `page.getByText(${JSON.stringify(spec.text)}${optBag ? `, ${optBag}` : ''})`;
  else if (spec.altText != null) base = `page.getByAltText(${JSON.stringify(spec.altText)}${optBag ? `, ${optBag}` : ''})`;
  else if (spec.title != null) base = `page.getByTitle(${JSON.stringify(spec.title)}${optBag ? `, ${optBag}` : ''})`;
  else return bad(`${ctx.label}: locator spec ${JSON.stringify(spec)} has no known key (role/label/placeholder/text/testId/altText/title/css)`);

  if (spec.filterText != null) base += `.filter({ hasText: ${JSON.stringify(spec.filterText)} })`;
  if (spec.nth === 'first') base += `.first()`;
  else if (spec.nth === 'last') base += `.last()`;
  else if (Number.isInteger(spec.nth)) base += `.nth(${spec.nth})`;
  return base;
}

/** Page Object for one feature, with REAL locators from selmap. */
function featurePageTs(model) {
  const pm = selmap.pages[model.className] || { fields: {}, submit: {}, url: undefined };
  const missing = [];

  const locatorDecls = Object.entries(pm.fields || {})
    .map(([key, spec]) => {
      const expr = locatorExpr(spec, { missing, label: `field "${key}"` })
        || `page.locator('MISSING /* ${key} */')`;
      return `  private readonly ${camel('f ' + key)}: Locator = this.${expr}; // field "${key}"`;
    })
    .join('\n');

  const methods = model.actions
    .map((a) => {
      const submitExpr = locatorExpr(pm.submit?.[a.method], { missing, label: `submit for ${a.method}` });
      const fillLines = a.fields
        .map((key) => {
          if (!(key in (pm.fields || {}))) {
            missing.push(`field selector for "${key}"`);
            return `    // MISSING selector for "${key}" — add pages.${model.className}.fields["${key}"] to selmap.json`;
          }
          return `    if (${JSON.stringify(key)} in fields) await this.${camel('f ' + key)}.fill(fields[${JSON.stringify(key)}]);`;
        })
        .join('\n');
      const param = a.hasTable ? 'fields: Record<string, string>' : '';
      const submit = submitExpr
        ? `    await this.${submitExpr}.click();`
        : `    // MISSING submit selector for ${a.method} — add pages.${model.className}.submit["${a.method}"] to selmap.json`;
      return `  /** ${a.label} */
  async ${a.method}(${param}): Promise<void> {
${fillLines || '    // no data-table fields for this action'}
${submit}
  }`;
    })
    .join('\n\n');

  return {
    missing,
    content: `import { BasePage } from './base.page.js';
import { Locator } from '@playwright/test';

/**
 * Page Object for "${model.name}".
 * Locators below were captured from the live site during scaffolding —
 * user-facing (getByRole / getByLabel / getByPlaceholder / getByText /
 * getByTestId) wherever the markup allowed, raw page.locator() only where it did not.
 */
export class ${model.className} extends BasePage {
${locatorDecls || '  // no field selectors recorded'}

  async open(path = ${JSON.stringify(pm.url || '/')}): Promise<void> {
    await this.page.goto(path);
  }

${methods}
}
`,
  };
}

/* -------- shared step registry: never define a step twice ----------- */
const definedSteps = new Map();
function scanExistingStepDefs(dir) {
  if (!existsSync(dir)) return;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.ts')) {
        const src = readFileSync(full, 'utf8');
        for (const m of src.matchAll(/\b(Given|When|Then)\(\s*(['"`])([\s\S]*?)\2/g))
          definedSteps.set(`${m[1]}::${m[3]}`, relative(process.cwd(), full));
      }
    }
  };
  walk(dir);
}

/** step defs for one feature. Assertions come from the .feature text. */
function stepsTs(model) {
  const thisFile = relative(process.cwd(), join(STEPS_DIR, `${model.slug}.steps.ts`));
  const reused = [];
  const fresh = model.steps.filter((s) => {
    const key = `${s.keyword}::${s.expr}`;
    if (definedSteps.has(key)) {
      reused.push({ key, file: definedSteps.get(key) });
      return false;
    }
    definedSteps.set(key, thisFile);
    return true;
  });
  if (!fresh.length) return { content: null, reused, newCount: 0 };

  const actionByLabel = new Map(model.actions.map((a) => [a.label, a]));

  const defs = fresh
    .map((s) => {
      const names = argNames(s.params);
      const sig = names
        .map((n, i) => `${n}: ${tsType(s.params[i])}`)
        .concat(s.hasTable ? ['table: DataTable'] : [])
        .join(', ');
      const head = `${s.keyword}('${s.expr.replace(/'/g, "\\'")}', async function (this: PlaywrightWorld${sig ? ', ' + sig : ''}) {`;

      let body;
      const label = actionLabel(s.sampleText);
      if (s.keyword === 'Given') {
        body = `  await this.pages.${model.prop}.open();`;
      } else if (s.keyword === 'When') {
        const a = actionByLabel.get(label);
        if (a && s.hasTable) {
          body = `  const fields = Object.fromEntries(table.raw()) as Record<string, string>;
  await this.pages.${model.prop}.${a.method}(fields);`;
        } else if (a) {
          body = `  await this.pages.${model.prop}.${a.method}(${names.join(', ')});`;
        } else {
          body = `  // TODO: no action matched "${label}" — add it to the feature's When steps or wire manually.`;
        }
      } else {
        // Then — assert exactly what the .feature says
        const t = s.sampleText;
        if (/"([^"]+)"\s*(page|screen|view)\b/i.test(t) || /reach(?:es)?\b/i.test(t)) {
          body = `  await this.pages.${model.prop}.expectPage(${names[0] ?? '""'});`;
        } else if (/message|error|text|shown|displayed|see\b/i.test(t) && names.length) {
          body = `  await this.pages.${model.prop}.expectText(${names[0]});`;
        } else if (/stay|remain/i.test(t) && names.length) {
          body = `  await this.pages.${model.prop}.expectPage(${names[0]});`;
        } else if (/script|xss|not (?:run|execute)/i.test(t)) {
          body = `  const fired = await this.page.evaluate(() => (window as unknown as { __xss__?: unknown }).__xss__);
  expect(fired).toBeFalsy();`;
        } else {
          body = `  // TODO: assert "${t.replace(/"/g, "'")}" — phrasing not recognised, wire manually.`;
        }
      }
      return `${head}\n${body}\n});`;
    })
    .join('\n\n');

  const reusedNote = reused.length
    ? '//\n// Reused from other files (not redefined here):\n' +
      reused.map((r) => `//   ${r.key.replace('::', '  ')}  -> ${r.file}`).join('\n') +
      '\n'
    : '';

  return {
    reused,
    newCount: fresh.length,
    content: `import { Given, When, Then, DataTable } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { PlaywrightWorld } from '../support/world.js';

/**
 * Steps for ${relative(process.cwd(), model.path).replace(/\\/g, '/')}
 * Bodies delegate to the ${model.className} Page Object.
 * \`async function\` (not arrow) so Cucumber binds \`this\` (the World).
 * Assertions reflect the .feature as written — a site that disagrees fails here.
 */
${reusedNote}
${defs}
`,
  };
}

/* ------------------------------- run -------------------------------- */
const pageClasses = models.map((m) => ({ className: m.className, slug: m.slug, prop: m.prop }));

emit(join(SUPPORT_DIR, 'world.ts'), worldTs());
emit(join(SUPPORT_DIR, 'hooks.ts'), hooksTs());
emit(join(SUPPORT_DIR, 'data.ts'), dataTs());
// cucumber.js's config body is CommonJS (module.exports). If the target
// package.json declares "type": "module", a plain .js extension there
// gets parsed as ESM and throws "module is not defined" — .cjs always
// loads as CommonJS regardless of package type, so use it in that case.
{
  const pkgPathForType = join(process.cwd(), 'package.json');
  let isESM = false;
  if (existsSync(pkgPathForType)) {
    try {
      isESM = JSON.parse(readFileSync(pkgPathForType, 'utf8')).type === 'module';
    } catch {
      // unparsable package.json — fall through, treat as CommonJS default
    }
  }
  const cucumberConfigName = isESM ? 'cucumber.cjs' : 'cucumber.js';
  emit(join(process.cwd(), cucumberConfigName), cucumberJs());
}
emit(join(PAGES_DIR, 'base.page.ts'), basePageTs());
emit(join(PAGES_DIR, 'index.ts'), pagesIndexTs(pageClasses));

// align package.json's cucumberTs script (only if still the scaffold default)
(() => {
  const pkgPath = join(process.cwd(), 'package.json');
  if (!existsSync(pkgPath)) return;
  const KNOWN_OLD =
    'node --import tsx node_modules/@cucumber/cucumber/bin/cucumber.js src/features/*.feature --import "src/step-definitions/**/*.ts"';
  const WANTED = 'node --import tsx node_modules/@cucumber/cucumber/bin/cucumber.js';
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.scripts ||= {};
  const cur = pkg.scripts.cucumberTs;
  if (cur === WANTED) return;
  if (cur && cur !== KNOWN_OLD) {
    planned.push({ path: 'package.json', status: 'cucumberTs customised — left as-is' });
    return;
  }
  if (DRY) {
    planned.push({ path: 'package.json', status: 'would set scripts.cucumberTs' });
    return;
  }
  pkg.scripts.cucumberTs = WANTED;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  planned.push({ path: 'package.json', status: 'scripts.cucumberTs updated' });
})();

scanExistingStepDefs(STEPS_DIR);

const allMissing = [];
for (const m of models) {
  const page = featurePageTs(m);
  emit(join(PAGES_DIR, `${m.slug}.page.ts`), page.content);
  if (page.missing.length)
    allMissing.push(`  ${m.slug}.page.ts: ${page.missing.join('; ')}`);

  const st = stepsTs(m);
  if (st.content === null) {
    planned.push({
      path: relative(process.cwd(), join(STEPS_DIR, `${m.slug}.steps.ts`)),
      status: `skipped — all ${m.steps.length} steps already defined`,
    });
  } else {
    emit(join(STEPS_DIR, `${m.slug}.steps.ts`), st.content);
    if (st.reused.length)
      planned.push({
        path: relative(process.cwd(), join(STEPS_DIR, `${m.slug}.steps.ts`)),
        status: `${st.newCount} new, ${st.reused.length} reused`,
      });
  }
}

/* ------------------------------ report ----------------------------- */
console.log(`\nscaffold.mjs --emit — ${DRY ? 'DRY RUN' : 'done'}\n`);
for (const p of planned) console.log(`  ${p.status.padEnd(26)} ${p.path}`);
if (allMissing.length) {
  console.log('\nSelectors still missing from selmap.json (Page Objects have MISSING markers):');
  for (const l of allMissing) console.log(l);
  console.log('\nExplore those on the live site, add them to selmap.json, delete the affected');
  console.log('*.page.ts, and re-run --emit.');
}
console.log('\nNext:  npm run cucumberTs -- --dry-run   then   npm run cucumberTs\n');
