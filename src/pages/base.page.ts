import { Page, Locator, expect } from '@playwright/test';

/** Web-first assertion timeout. The 5s Playwright default is often too tight
 *  for a form POST + redirect on a slow shared host. Override with
 *  process.env.UI_TIMEOUT (ms) if a site needs more or less. */
export const UI_TIMEOUT = Number(process.env.UI_TIMEOUT) || 15_000;

/** Gherkin page-name -> URL fragment. Filled from what the agent observed
 *  on the live site while scaffolding. Add entries as new page names appear. */
export const PAGE_PATHS: Record<string, string> = {
  "Enter Account Information": "/signup",
  "Signup Login": "/login",
  "Login to your account": "/login",
  "Contact Us": "/contact_us",
  "home": "/",
};

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

  locator(selector: string): Locator {
    return this.page.locator(selector);
  }

  /**
   * Assert the site header shows the logged-in marker for `name`, e.g.
   * `Logged in as Login Probe`. Captured live: automationexercise.com renders
   * `<li><a> Logged in as <b>NAME</b></a></li>` in the `.shop-menu` navbar
   * once a session exists. Matched as substring text so the exact element
   * nesting (`<a>` + `<b>`) doesn't matter.
   */
  async expectLoggedInAs(prefix: string, name: string): Promise<void> {
    await expect(
      this.page.getByText(`${prefix} ${name}`, { exact: false }).first(),
    ).toBeVisible({ timeout: UI_TIMEOUT });
  }

  /**
   * Assert the header shows the signed-OUT "Signup / Login" navbar link
   * (`href="/login"`). Captured live: this link is present only while logged
   * out; after login it is replaced by "Logout" + "Logged in as …".
   */
  async expectHeaderSignupLoginLink(label = 'Signup / Login'): Promise<void> {
    await expect(
      this.page.getByRole('link', { name: label }).first(),
    ).toBeVisible({ timeout: UI_TIMEOUT });
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
