import { BasePage, UI_TIMEOUT } from './base.page.js';
import { Locator, expect } from '@playwright/test';

/**
 * Page Object for "Login to your account" on automationexercise.com.
 *
 * Covers the login block on /login and the header "Logout" link:
 *   1. the "Login to your account" form on /login  -> /  (home, logged in)
 *      or, on bad credentials, stays on /login with a red error <p>.
 *   2. the header "Logout" link (present only while signed in) -> /login,
 *      header reverts to the "Signup / Login" link.
 *
 * Locators captured from the live site during scaffolding. The login form
 * exposes a stable `data-qa` on both inputs and the submit button
 * (`login-email` / `login-password` / `login-button`), so those use
 * getByTestId (the World points Playwright's test-id attr at `data-qa`).
 * The site's own "incorrect credentials" error is a `<p style="color:red">`
 * inside `.login-form`; the header links are addressed by role/name.
 *
 * automationexercise.com serves Google "vignette" ad interstitials that can
 * overlay the form and swallow a click. The World blocks that ad traffic at
 * the network layer; this page additionally scrolls its target into view and
 * clears any leftover overlay before clicking, mirroring RegistrationPage.
 */
export class LoginPage extends BasePage {
  // --- "Login to your account" form (/login) ---
  private readonly fEmail: Locator = this.page.getByTestId('login-email');
  private readonly fPassword: Locator = this.page.getByTestId('login-password');
  private readonly loginButton: Locator = this.page.getByTestId('login-button');

  // --- the site's own "bad credentials" error, inside the login block ---
  // Captured live: `<p style="color: red;">Your email or password is
  // incorrect!</p>` inside `form[action="/login"]` within `.login-form`.
  private readonly loginError: Locator = this.page.locator('.login-form form p');

  // --- header links ---
  private readonly logoutLink: Locator = this.page.getByRole('link', { name: 'Logout' });

  async open(path = '/login'): Promise<void> {
    await this.page.goto(path);
    await this.dismissAdOverlay();
  }

  /**
   * Remove any Google "vignette" ad frame / overlay that slipped past the
   * network block, and clear the `#google_vignette` hash it leaves behind, so
   * a subsequent click isn't intercepted. Safe to call when no ad is present.
   * (Same implementation as RegistrationPage — kept local so the two page
   * objects stay independently readable.)
   */
  private async dismissAdOverlay(): Promise<void> {
    await this.page
      .evaluate(() => {
        for (const el of Array.from(
          document.querySelectorAll<HTMLElement>(
            'iframe[id^="aswift_"], iframe[name^="aswift_"], ins.adsbygoogle, #google_vignette, .google-vignette, [id*="google_vignette"]',
          ),
        )) {
          el.remove();
        }
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
        if (location.hash === '#google_vignette') {
          history.replaceState(null, '', location.pathname + location.search);
        }
      })
      .catch(() => {
        /* page navigated mid-eval — nothing to dismiss */
      });
  }

  /** Scroll `target` into view, clear any ad overlay, then click it, retrying
   *  once past a late-mounting vignette frame. Tolerates "already navigated":
   *  under heavy parallel load a click can succeed and its navigation be in
   *  flight while `click()` still rejects (element detached) — the old retry
   *  then hung on `scrollIntoViewIfNeeded` against the stale element. We
   *  snapshot the URL first and, if it moved (or the target went away), treat
   *  the click as done. */
  private async safeClick(target: Locator): Promise<void> {
    const urlBefore = this.page.url();
    await this.dismissAdOverlay();
    await this.safeScrollIntoView(target);
    await this.page.waitForTimeout(400);
    await this.dismissAdOverlay();
    try {
      await target.click({ timeout: 5_000 });
    } catch (err) {
      if (await this.clickAlreadyLanded(target, urlBefore)) return;
      await this.dismissAdOverlay();
      await this.safeScrollIntoView(target);
      try {
        await target.click({ timeout: 10_000 });
      } catch (err2) {
        if (await this.clickAlreadyLanded(target, urlBefore)) return;
        throw err2 instanceof Error ? err2 : (err as Error);
      }
    }
  }

  /** `scrollIntoViewIfNeeded` on an element the page has navigated past hangs
   *  for the full action timeout. Cap it low and swallow a timeout — the
   *  click's own waits still cover actionability. */
  private async safeScrollIntoView(target: Locator): Promise<void> {
    await target.scrollIntoViewIfNeeded({ timeout: 3_000 }).catch(() => {
      /* element gone / page navigating */
    });
  }

  /** True when the click can be considered to have taken effect: the URL
   *  moved off `urlBefore`, or the target is no longer visible. */
  private async clickAlreadyLanded(target: Locator, urlBefore: string): Promise<boolean> {
    if (this.page.url() !== urlBefore) return true;
    return !(await target.isVisible().catch(() => false));
  }

  /**
   * The "Login to your account" form on /login.
   * `fields` carries the email + password the step resolved. A blank cell is
   * filled as "" so the browser's own required-field validation fires — that
   * is the behaviour the negative scenarios put under test. Only the fields
   * present in the data table are touched.
   */
  async theVisitorSubmitsTheLoginForm(fields: Record<string, string>): Promise<void> {
    await this.dismissAdOverlay();
    if ('email' in fields) await this.fEmail.fill(fields['email']);
    if ('password' in fields) await this.fPassword.fill(fields['password']);
    await this.safeClick(this.loginButton);
  }

  /** The header "Logout" link (present only while signed in). Captured live:
   *  navigates to /login and the header reverts to "Signup / Login". */
  async theVisitorLogsOut(): Promise<void> {
    await this.safeClick(this.logoutLink);
  }

  /**
   * Assert the login submission was rejected client-side / server-side and
   * the browser stayed on /login with the login form still mounted. Captured
   * live: a wrong password or an unknown e-mail keeps the URL at /login and
   * re-renders the form with a red error <p>.
   */
  async expectStillOnLoginPage(): Promise<void> {
    await expect(this.page).toHaveURL(/\/login(\?|#|$)/, { timeout: UI_TIMEOUT });
    await expect(this.loginButton).toBeVisible({ timeout: UI_TIMEOUT });
  }

  /**
   * Assert the site rendered its own credential error inside the login block.
   * Captured live: `<p style="color: red;">Your email or password is
   * incorrect!</p>`. Text compared verbatim (whitespace-normalised,
   * case-insensitive to survive any CSS transform).
   */
  async expectLoginError(message: string): Promise<void> {
    const normalised = message.trim().replace(/\s+/g, ' ');
    const banner = this.loginError.filter({
      hasText: new RegExp(escapeRegExp(normalised), 'i'),
    });
    await expect(banner.first()).toBeVisible({ timeout: UI_TIMEOUT });
  }

  /**
   * Assert `fieldKey` ("email" | "password") is failing HTML5 constraint
   * validation — via the input's `validity` flags, not `validationMessage`
   * (which varies by engine). `message` (from the .feature) picks the flag:
   * an "@"/email mention -> typeMismatch (checked first, so "missing an '@'"
   * reads as a format error); a fill-out/required/blank phrase ->
   * valueMissing; anything else -> !validity.valid.
   */
  async expectFieldValidationMessage(fieldKey: string, message: string): Promise<void> {
    const key = fieldKey.trim().toLowerCase();
    const loc = key === 'password' ? this.fPassword : this.fEmail;

    const m = message.trim().toLowerCase();
    const flag: 'valueMissing' | 'typeMismatch' | 'invalid' = /(@|e-?mail)/.test(m)
      ? 'typeMismatch'
      : /(fill out this field|required|value missing|blank|missing value)/.test(m)
        ? 'valueMissing'
        : 'invalid';
    const expected =
      flag === 'valueMissing'
        ? { valueMissing: true }
        : flag === 'typeMismatch'
          ? { typeMismatch: true }
          : { valid: false };

    await expect
      .poll(
        () =>
          loc.evaluate((el) => {
            const v = (el as HTMLInputElement).validity;
            return { valueMissing: v.valueMissing, typeMismatch: v.typeMismatch, valid: v.valid };
          }),
        {
          timeout: UI_TIMEOUT,
          message: `${key} should fail validation (${JSON.stringify(message.trim())})`,
        },
      )
      .toEqual(expect.objectContaining(expected));
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
