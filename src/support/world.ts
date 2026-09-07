import { setWorldConstructor, World, IWorldOptions } from '@cucumber/cucumber';
import { Browser, BrowserContext, Page, chromium, firefox, webkit, selectors } from '@playwright/test';
import type winston from 'winston';
import { PageObjects, buildPageObjects } from '../pages/index.js';

// This site tags elements with "data-qa", not the default "data-testid";
// point Playwright's getByTestId() at it so the generated locators resolve.
selectors.setTestIdAttribute("data-qa");

/** Engine selected per run with `BROWSER=<name>` (default `chromium`). */
export type BrowserName = 'chromium' | 'firefox' | 'webkit';
const SUPPORTED_BROWSERS: readonly BrowserName[] = ['chromium', 'firefox', 'webkit'];

function resolveBrowserName(raw: string | undefined): BrowserName {
  if (raw === undefined || raw === '') return 'chromium';
  const name = raw.trim().toLowerCase();
  if ((SUPPORTED_BROWSERS as readonly string[]).includes(name)) return name as BrowserName;
  throw new Error(
    `BROWSER="${raw}" is not supported. Use one of: ${SUPPORTED_BROWSERS.join(', ')}.`,
  );
}

/** Snapshot of the account-information form as it was submitted. Keys mirror
 *  the .feature data-table labels; every value is the exact string typed
 *  into the page (checkbox cells normalised to "checked" / "unchecked",
 *  a blank table cell kept as ""). */
export interface AccountInfoSubmission {
  title: string;
  password: string;
  dobDay: string;
  dobMonth: string;
  dobYear: string;
  newsletter: 'checked' | 'unchecked';
  offers: 'checked' | 'unchecked';
  firstName: string;
  lastName: string;
  company: string;
  address: string;
  address2: string;
  country: string;
  state: string;
  city: string;
  zipcode: string;
  mobileNumber: string;
  /** true when the "company" cell in the feature was blank. */
  companyBlank: boolean;
  /** true when the "address 2" cell in the feature was blank. */
  address2Blank: boolean;
}


/** Custom Cucumber World — one instance per scenario. */
export class PlaywrightWorld extends World {
  browser!: Browser;
  context!: BrowserContext;
  page!: Page;
  pages!: PageObjects;

  /** Per-scenario child logger, tagged with the scenario name. Set in the
   *  `Before` hook; use as `this.logger.debug(...)` from any step definition.
   *  (Named `logger`, not `log` — Cucumber's World base already owns `log`
   *  as its report-attachment API.) */
  logger!: winston.Logger;

  readonly baseUrl: string;
  readonly browserName: BrowserName;
  readonly headless: boolean;

  /** Scratch state shared between the steps of one scenario. Set in a When,
   *  read in a later step. Reset per scenario (new World instance each time).
   *  `lastSignupName` — the display name the signup step submitted, so the
   *  "Logged in as <name>" assertion checks what was actually sent, not a
   *  literal. Add more fields as scenarios need. */
  lastSignupName?: string;

  /** The e-mail the "starts a signup in the … block" step actually submitted
   *  this scenario. A positive scenario gets a fresh `uniqueEmail()`; a
   *  negative scenario submits its literal bad / blank value; the
   *  duplicate-e-mail scenario submits `forcedSignupEmail` (below). Read back
   *  by assertions so they check what was sent, never a literal. */
  lastSignupEmail?: string;

  /** Set ONLY by the name-scoped `Before` hook for the "already has an
   *  account" scenario: the hook first registers a real account via
   *  `uniqueEmail()`, logs out, and pins that exact address here. The signup
   *  `When` step then submits this verbatim so the "Email Address already
   *  exist!" path is genuinely exercised. Undefined for every other
   *  scenario. */
  forcedSignupEmail?: string;

  /** The real credential pair seeded by the login.feature `Before` hook
   *  (src/support/hooks/login.hooks.ts). That hook registers a brand-new
   *  account through the live signup UI, logs it out, and pins its exact
   *  e-mail / password / display name here. The login `When` step resolves
   *  the feature's "the registered account email/password" placeholder cells
   *  to these, and the "Logged in as" assertion checks `loginAccountName`.
   *  Undefined for scenarios outside login.feature. */
  loginAccountEmail?: string;
  loginAccountPassword?: string;
  loginAccountName?: string;

  /** The email/password actually submitted by the login `When` step this
   *  scenario (a seeded value, a literal bad value, or a blank cell). Read
   *  back by later Then steps so an assertion checks what was sent.
   *  `lastLoginEmail` being defined is also the signal that the current
   *  scenario is a login scenario (used to route the shared
   *  "the message {string} is shown" step). */
  lastLoginEmail?: string;
  lastLoginPassword?: string;

  /** The login field ("email" | "password") that a
   *  "the <field> field is reported invalid for …" step asserted on. The
   *  following shared "the message {string} is shown" step reads this to know
   *  which input's HTML5 constraint bubble to check. */
  lastLoginInvalidField?: 'email' | 'password';

  /** The account-information field the "…with {string} left blank" step was
   *  told to leave empty (e.g. "password", "mobile number"). The later
   *  assertion reads this back to check the browser flagged the field that
   *  was actually blanked, not a literal from the .feature. */
  lastBlankField?: string;

  /** Every value the "submits the account information form" step actually
   *  put on the page, captured verbatim from the data table (a blank cell
   *  stays an empty string). Later Then steps read these back so an
   *  assertion checks what was submitted, never a literal re-typed from the
   *  .feature. Reset per scenario. */
  lastAccountInfo?: AccountInfoSubmission;

  constructor(options: IWorldOptions) {
    super(options);
    this.baseUrl = process.env.BASE_URL ?? "https://automationexercise.com";
    this.browserName = resolveBrowserName(process.env.BROWSER);
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
