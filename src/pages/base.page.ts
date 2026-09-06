import { Page, Locator, expect } from '@playwright/test';

/** Web-first assertion timeout. The 5s Playwright default is often too tight
 *  for a form POST + redirect on a slow shared host. Override with
 *  process.env.UI_TIMEOUT (ms) if a site needs more or less. */
export const UI_TIMEOUT = Number(process.env.UI_TIMEOUT) || 15_000;

/** Gherkin page-name -> URL fragment. Filled from what the agent observed
 *  on the live site while scaffolding. Add entries as new page names appear. */
export const PAGE_PATHS: Record<string, string> = {
  "Enter Account Information": "/signup",
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
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
