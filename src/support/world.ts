import { setWorldConstructor, World, IWorldOptions } from '@cucumber/cucumber';
import { Browser, BrowserContext, Page, chromium, firefox, webkit, selectors } from '@playwright/test';
import type winston from 'winston';
import { PageObjects, buildPageObjects } from '../pages/index.js';

// This site tags elements with "data-qa", not the default "data-testid";
// point Playwright's getByTestId() at it so the generated locators resolve.
selectors.setTestIdAttribute("data-qa");

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
  readonly browserName: 'chromium' | 'firefox' | 'webkit';
  readonly headless: boolean;

  /** Scratch state shared between the steps of one scenario. Set in a When,
   *  read in a later step. Reset per scenario (new World instance each time).
   *  `lastSignupName` — the display name the signup step submitted, so the
   *  "Logged in as <name>" assertion checks what was actually sent, not a
   *  literal. Add more fields as scenarios need. */
  lastSignupName?: string;

  /** Every value the "submits the account information form" step actually
   *  put on the page, captured verbatim from the data table (a blank cell
   *  stays an empty string). Later Then steps read these back so an
   *  assertion checks what was submitted, never a literal re-typed from the
   *  .feature. Reset per scenario. */
  lastAccountInfo?: AccountInfoSubmission;

  constructor(options: IWorldOptions) {
    super(options);
    this.baseUrl = process.env.BASE_URL ?? "https://automationexercise.com";
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
