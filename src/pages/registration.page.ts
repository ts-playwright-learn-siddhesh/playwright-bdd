import { BasePage, UI_TIMEOUT } from './base.page.js';
import { Locator, expect } from '@playwright/test';
import type { AccountInfoSubmission } from '../support/world.js';

/**
 * Page Object for "New user registration" on automationexercise.com.
 *
 * Covers three steps of the signup flow:
 *   1. the "New User Signup!" block on /login (name + email)  -> /signup
 *   2. the "Enter Account Information" form on /signup         -> /account_created
 *   3. the "Continue" link on /account_created                -> /  (home, logged in)
 *
 * Locators were captured from the live site during scaffolding. The account-
 * information form exposes a stable `data-qa` on every text input, so those use
 * getByTestId; the Title radios, the Date-of-Birth <select>s and the two
 * checkboxes have no data-qa and are addressed by their id.
 *
 * automationexercise.com serves Google "vignette" ad interstitials that can
 * overlay the form and swallow a click. The World blocks that ad traffic at the
 * network layer, and every action method below additionally scrolls its target
 * into view and dismisses any leftover overlay before clicking, so a slow ad
 * frame can't intercept the submit.
 */
export class RegistrationPage extends BasePage {
  // --- "New User Signup!" block (/login) ---
  private readonly fName: Locator = this.page.getByTestId('signup-name');
  private readonly fEmail: Locator = this.page.getByTestId('signup-email');
  private readonly signupButton: Locator = this.page.getByTestId('signup-button');

  // --- "Enter Account Information" form (/signup) ---
  private readonly fTitleMr: Locator = this.page.locator('#id_gender1');
  private readonly fTitleMrs: Locator = this.page.locator('#id_gender2');
  private readonly fPassword: Locator = this.page.getByTestId('password');
  private readonly fDay: Locator = this.page.locator('#days');
  private readonly fMonth: Locator = this.page.locator('#months');
  private readonly fYear: Locator = this.page.locator('#years');
  private readonly fNewsletter: Locator = this.page.locator('#newsletter');
  private readonly fOptin: Locator = this.page.locator('#optin');
  private readonly fFirstName: Locator = this.page.getByTestId('first_name');
  private readonly fLastName: Locator = this.page.getByTestId('last_name');
  private readonly fCompany: Locator = this.page.getByTestId('company');
  private readonly fAddress: Locator = this.page.getByTestId('address');
  private readonly fAddress2: Locator = this.page.getByTestId('address2');
  private readonly fCountry: Locator = this.page.getByTestId('country');
  private readonly fState: Locator = this.page.getByTestId('state');
  private readonly fCity: Locator = this.page.getByTestId('city');
  private readonly fZipcode: Locator = this.page.getByTestId('zipcode');
  private readonly fMobileNumber: Locator = this.page.getByTestId('mobile_number');
  private readonly createAccountButton: Locator = this.page.getByTestId('create-account');

  // --- "Account Created!" page ---
  // The heading's DOM text is literally "Account Created!"; CSS
  // (text-transform: uppercase) renders it as "ACCOUNT CREATED!". Assert
  // against this element case-insensitively rather than on raw textContent.
  private readonly accountCreatedHeading: Locator = this.page.getByTestId('account-created');
  private readonly continueButton: Locator = this.page.getByTestId('continue-button');

  async open(path = '/login'): Promise<void> {
    await this.page.goto(path);
    await this.dismissAdOverlay();
  }

  /**
   * Remove any Google "vignette" ad frame / overlay that slipped past the
   * network block, and clear the `#google_vignette` hash it leaves behind, so a
   * subsequent click isn't intercepted. Safe to call when no ad is present.
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
        // Google's vignette locks scroll on <html>/<body> while it is up.
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

  /**
   * Scroll `target` into view, clear any ad overlay, then click it. The
   * Google "vignette" interstitial can mount a frame that covers the whole
   * viewport (form + submit button) a beat after the page settles, so we
   * dismiss it, wait out the frame's mount window, dismiss again, and pass
   * a short `trial`/retry click: if an ad frame still intercepts, Playwright
   * re-attempts rather than failing on the first obscured hit.
   *
   * "Already navigated" tolerance: under heavy parallel load the site can be
   * slow enough that the FIRST click succeeds and its navigation is in
   * flight, but `click()` still rejects (element detached mid-action). The
   * old retry then re-ran `scrollIntoViewIfNeeded` against the stale element
   * and timed out (30s) — surfacing a navigation success as a failure. So we
   * snapshot the URL first, and if it changed (or the target went away)
   * while we were clicking, we treat the click as done.
   */
  private async safeClick(target: Locator): Promise<void> {
    const urlBefore = this.page.url();
    await this.dismissAdOverlay();
    await this.safeScrollIntoView(target);
    // give a late-mounting vignette frame a chance to appear, then clear it
    await this.page.waitForTimeout(400);
    await this.dismissAdOverlay();
    try {
      await target.click({ timeout: 5_000 });
    } catch (err) {
      if (await this.clickAlreadyLanded(target, urlBefore)) return;
      // an ad frame likely mounted between the dismiss and the click —
      // clear it once more and retry, forcing past any residual overlay
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

  /** `scrollIntoViewIfNeeded` on an element the page has already navigated
   *  past hangs for the full 30s action timeout. Cap it low and swallow a
   *  timeout — the click itself still waits for actionability. */
  private async safeScrollIntoView(target: Locator): Promise<void> {
    await target.scrollIntoViewIfNeeded({ timeout: 3_000 }).catch(() => {
      /* element gone / page navigating — the click's own waits cover it */
    });
  }

  /** True when the click can be considered to have taken effect already:
   *  the URL moved off `urlBefore`, or the target is no longer visible
   *  (form replaced by the next page). */
  private async clickAlreadyLanded(target: Locator, urlBefore: string): Promise<boolean> {
    if (this.page.url() !== urlBefore) return true;
    return !(await target.isVisible().catch(() => false));
  }

  /**
   * Step 1 — the "New User Signup!" block on /login.
   * `fields` carries the name + email the step resolved (a fresh
   * `uniqueEmail()` for a positive run, the pinned duplicate address for the
   * "already exists" scenario, or a literal bad / blank value for the other
   * negatives). A blank cell is filled as "" so the browser's own
   * required-field validation fires — that is the behaviour under test.
   */
  async theVisitorStartsASignupInTheBlock(fields: Record<string, string>): Promise<void> {
    if ('name' in fields) await this.fName.fill(fields['name']);
    if ('email' in fields) await this.fEmail.fill(fields['email']);
    await this.safeClick(this.signupButton);
  }

  /**
   * Step 2 — the "Enter Account Information" form on /signup.
   * Each control gets the interaction its type needs: radio for Title,
   * selectOption for the Date-of-Birth dropdowns, check for the two
   * newsletter/offers checkboxes, fill for everything else. A blank data-
   * table cell is filled as "" (clears the input) — the feature uses that
   * to mean "leave this optional field empty".
   *
   * Returns a verbatim snapshot of what was submitted so the step can stash
   * it on the World for the later assertions.
   */
  async theVisitorSubmitsTheAccountInformationForm(
    fields: Record<string, string>,
  ): Promise<AccountInfoSubmission> {
    await this.dismissAdOverlay();

    const get = (k: string) => (k in fields ? fields[k] : '');
    const title = get('title');
    if ('title' in fields) {
      const t = title.trim().toLowerCase();
      await (t === 'mrs' ? this.fTitleMrs : this.fTitleMr).check();
    }
    if ('password' in fields) await this.fPassword.fill(get('password'));

    // DoB <select> option values: day = "1".."31", month = "1".."12"
    // (January=1 … December=12), year = the 4-digit year.
    if ('date of birth day' in fields) await this.fDay.selectOption(get('date of birth day'));
    if ('date of birth month' in fields) await this.fMonth.selectOption(get('date of birth month'));
    if ('date of birth year' in fields) await this.fYear.selectOption(get('date of birth year'));

    const newsletterOn = this.isChecked(get('Sign up for our newsletter!'));
    const offersOn = this.isChecked(get('Receive special offers from our partners!'));
    if ('Sign up for our newsletter!' in fields) {
      await this.setCheckbox(this.fNewsletter, get('Sign up for our newsletter!'));
    }
    if ('Receive special offers from our partners!' in fields) {
      await this.setCheckbox(this.fOptin, get('Receive special offers from our partners!'));
    }

    if ('first name' in fields) await this.fFirstName.fill(get('first name'));
    if ('last name' in fields) await this.fLastName.fill(get('last name'));
    if ('company' in fields) await this.fCompany.fill(get('company'));
    if ('address' in fields) await this.fAddress.fill(get('address'));
    if ('address 2' in fields) await this.fAddress2.fill(get('address 2'));
    if ('country' in fields) await this.fCountry.selectOption(get('country'));
    if ('state' in fields) await this.fState.fill(get('state'));
    if ('city' in fields) await this.fCity.fill(get('city'));
    if ('zipcode' in fields) await this.fZipcode.fill(get('zipcode'));
    if ('mobile number' in fields) await this.fMobileNumber.fill(get('mobile number'));

    await this.safeClick(this.createAccountButton);

    return {
      title,
      password: get('password'),
      dobDay: get('date of birth day'),
      dobMonth: get('date of birth month'),
      dobYear: get('date of birth year'),
      newsletter: newsletterOn ? 'checked' : 'unchecked',
      offers: offersOn ? 'checked' : 'unchecked',
      firstName: get('first name'),
      lastName: get('last name'),
      company: get('company'),
      address: get('address'),
      address2: get('address 2'),
      country: get('country'),
      state: get('state'),
      city: get('city'),
      zipcode: get('zipcode'),
      mobileNumber: get('mobile number'),
      companyBlank: get('company').trim() === '',
      address2Blank: get('address 2').trim() === '',
    };
  }

  /**
   * Step 2 (negative) — the "Enter Account Information" form on /signup, but
   * with `blankField` deliberately left empty. Fills every other field from
   * `fields`, leaves `blankField` untouched (so the browser's own
   * required-field constraint fires), then clicks "Create Account". Nothing is
   * created; the caller stashes `blankField` on the World for the assertion.
   * `blankField` is a .feature data-table key, mapped via `fieldByKey`.
   */
  async theVisitorSubmitsTheAccountInformationFormWithLeftBlank(
    fields: Record<string, string>,
    blankField: string,
  ): Promise<void> {
    await this.dismissAdOverlay();
    const key = blankField.trim();
    const get = (k: string) => (k in fields ? fields[k] : '');

    // Fill every provided field EXCEPT the one to leave blank.
    for (const [k, loc] of Object.entries(this.fieldByKey())) {
      if (k === key || !(k in fields)) continue;
      if (k === 'country') await loc.selectOption(get(k));
      else await loc.fill(get(k));
    }

    await this.safeClick(this.createAccountButton);
  }

  /**
   * Assert the account-created confirmation is visible. The .feature spells
   * the message "ACCOUNT CREATED!" (the on-screen, CSS-uppercased form); the
   * DOM node's text is "Account Created!". Match case-insensitively against
   * the real heading so the rendered wording in the feature is honoured
   * without depending on textContent casing.
   */
  async expectAccountCreated(message: string): Promise<void> {
    const normalised = message.trim().replace(/\s+/g, ' ');
    await expect(this.accountCreatedHeading).toBeVisible({ timeout: UI_TIMEOUT });
    await expect(this.accountCreatedHeading).toHaveText(new RegExp(escapeRegExp(normalised), 'i'), {
      timeout: UI_TIMEOUT,
    });
  }

  /**
   * Assert the site rendered its own "Email Address already exist!" error
   * inside the "New User Signup!" block. Captured live: automationexercise.com
   * re-renders the block on /signup with `<p style="color: red;">Email Address
   * already exist!</p>` and does NOT show the account-information form. The
   * message text is compared verbatim (whitespace-normalised).
   */
  async expectSignupBlockError(message: string): Promise<void> {
    const normalised = message.trim().replace(/\s+/g, ' ');
    const banner = this.page
      .locator('.signup-form p')
      .filter({ hasText: new RegExp(escapeRegExp(normalised), 'i') });
    await expect(banner.first()).toBeVisible({ timeout: UI_TIMEOUT });
  }

  /**
   * Assert the visitor never reached the "Enter Account Information" form.
   * The URL alone is not enough — after a duplicate-e-mail submit the site
   * lands on /signup yet re-renders the signup *block*, not the account form.
   * Assert on the form control's absence instead.
   */
  async expectAccountInfoFormNotReached(): Promise<void> {
    await expect(this.createAccountButton).toHaveCount(0, { timeout: UI_TIMEOUT });
  }

  /**
   * Assert the "New User Signup!" submission was blocked client-side and the
   * page did not navigate away from /login. Captured live: an empty or
   * malformed e-mail (or an empty name) keeps the browser on /login with the
   * signup block still mounted.
   */
  async expectStillOnSignupBlockPage(): Promise<void> {
    await expect(this.page).toHaveURL(/\/login(\?|#|$)/, { timeout: UI_TIMEOUT });
    await expect(this.signupButton).toBeVisible({ timeout: UI_TIMEOUT });
  }

  /**
   * Assert the account-information form did not submit — still on /signup
   * with the "Create Account" button mounted. Captured live: leaving any
   * required field blank keeps the browser on /signup.
   */
  async expectStillOnAccountInfoPage(): Promise<void> {
    await expect(this.page).toHaveURL(/\/signup(\?|#|$)/, { timeout: UI_TIMEOUT });
    await expect(this.createAccountButton).toBeVisible({ timeout: UI_TIMEOUT });
  }

  /**
   * Assert `fieldKey` is failing HTML5 constraint validation — via the field's
   * `validity` flags, not the `validationMessage` string, which varies by
   * engine/version. `message` (from the .feature) names the expected failure
   * and picks the flag: an "@"/email mention -> typeMismatch (checked first,
   * so "missing an '@'" reads as a format error); a fill-out/required/blank
   * phrase -> valueMissing; anything else -> !validity.valid.
   * `fieldKey` is a .feature data-table key, mapped via `fieldByKey()`.
   */
  async expectFieldValidationMessage(fieldKey: string, message: string): Promise<void> {
    const key = fieldKey.trim();
    const loc = this.fieldByKey()[key];
    if (!loc) {
      throw new Error(`no locator mapped for field key "${key}" in RegistrationPage.fieldByKey()`);
    }

    const m = message.trim().toLowerCase();
    const flag: 'valueMissing' | 'typeMismatch' | 'invalid' = /(@|e-?mail)/.test(m)
      ? 'typeMismatch'
      : /(fill out this field|required|value missing|blank)/.test(m)
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
            const v = (el as HTMLInputElement | HTMLSelectElement).validity;
            return { valueMissing: v.valueMissing, typeMismatch: v.typeMismatch, valid: v.valid };
          }),
        { timeout: UI_TIMEOUT, message: `${key} should fail validation (${JSON.stringify(message.trim())})` },
      )
      .toEqual(expect.objectContaining(expected));
  }

  /**
   * .feature data-table key -> the input/select Locator on either the signup
   * block or the account-information form. Used by the blank-field submit
   * method and the validation-message assertion so both address fields by
   * the exact label the .feature uses.
   */
  private fieldByKey(): Record<string, Locator> {
    return {
      name: this.fName,
      email: this.fEmail,
      password: this.fPassword,
      'first name': this.fFirstName,
      'last name': this.fLastName,
      company: this.fCompany,
      address: this.fAddress,
      'address 2': this.fAddress2,
      country: this.fCountry,
      state: this.fState,
      city: this.fCity,
      zipcode: this.fZipcode,
      'mobile number': this.fMobileNumber,
    };
  }

  /** Step 3 — the "Continue" link on /account_created. */
  async theVisitorContinuesFromTheAccountCreatedPage(): Promise<void> {
    await this.safeClick(this.continueButton);
  }

  /** Interpret a data-table cell ("checked" / "unchecked" / "yes" / "no" …). */
  private isChecked(raw: string): boolean {
    return /^(checked|check|yes|true|on|1)$/i.test(raw.trim());
  }

  private async setCheckbox(box: Locator, raw: string): Promise<void> {
    if (this.isChecked(raw)) await box.check();
    else await box.uncheck();
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
