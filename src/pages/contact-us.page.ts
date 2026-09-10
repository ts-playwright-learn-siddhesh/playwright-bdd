import { BasePage, UI_TIMEOUT } from './base.page.js';
import { Dialog, Locator, expect } from '@playwright/test';

/**
 * Page Object for "Contact Us" on automationexercise.com (/contact_us).
 *
 * Covers the Contact Us form (#contact-us-form, name=contact-form) and the
 * green "Home" button rendered on the success state:
 *   1. fill name / email / subject / message (+ optional file upload) and
 *      click "Submit". The page raises window.confirm("Press OK to
 *      proceed!"); accepting it re-renders /contact_us with a green
 *      success box, dismissing it leaves the form untouched.
 *   2. the "Home" button on the success page  -> /  (home).
 *
 * Locators captured from the live site during scaffolding:
 *   - name / email / subject / message carry a placeholder AND a stable
 *     `data-qa`. The placeholder is the user-facing handle, but the footer
 *     newsletter box's `placeholder="Your email address"` substring-matches
 *     `getByPlaceholder('Email')`, so the placeholder lookups are scoped to
 *     the `#contact-us-form` root.
 *   - the file input (name=upload_file) has NO data-qa, id, label or
 *     placeholder — addressed by a scoped CSS selector as a last resort.
 *   - the submit control exposes `data-qa="submit-button"` -> getByTestId
 *     (the World points Playwright's test-id attr at `data-qa`).
 *   - the success box is `<div class="status alert alert-success">` inside
 *     `div.contact-form`; it is the only `.status` node on the page once
 *     the form has been submitted. Matched by its text.
 *   - the "Home" button is `<a class="btn btn-success" href="/">Home</a>`
 *     inside `div.contact-form`.
 *
 * The confirm dialog: Playwright auto-dismisses any dialog unless a
 * `page.on('dialog')` handler is attached. `theVisitorSubmitsTheContactUsForm`
 * takes the visitor's intent ('accept' | 'dismiss') as an argument and wires
 * a one-shot handler for the dialog that submit raises, so the choice is
 * always explicit and known before the click.
 *
 * automationexercise.com serves Google "vignette" ad interstitials that can
 * overlay the form and swallow a click. The World blocks that ad traffic at
 * the network layer; this page additionally scrolls its target into view
 * and clears any leftover overlay before clicking, mirroring the other
 * page objects in this suite.
 */
export class ContactUsPage extends BasePage {
  // --- the Contact Us form (#contact-us-form) ---
  // Scoped to the form root: the footer newsletter input's placeholder
  // ("Your email address") substring-matches getByPlaceholder('Email').
  private readonly form: Locator = this.page.locator('#contact-us-form');
  private readonly fName: Locator = this.form.getByPlaceholder('Name');
  private readonly fEmail: Locator = this.form.getByPlaceholder('Email');
  private readonly fSubject: Locator = this.form.getByPlaceholder('Subject');
  private readonly fMessage: Locator = this.form.getByPlaceholder('Your Message Here');
  private readonly fFile: Locator = this.form.locator('input[type=file]');
  private readonly submitButton: Locator = this.page.getByTestId('submit-button');

  // --- the success state ---
  // Captured live: `<div class="status alert alert-success">Success! Your
  // details have been submitted successfully.</div>` inside `.contact-form`.
  private readonly successBox: Locator = this.page.locator('.contact-form .status.alert-success');
  // `<a class="btn btn-success" href="/">Home</a>` on the success page.
  private readonly homeButton: Locator = this.page.locator('.contact-form a.btn.btn-success');

  /** The `window.confirm` prompt text seen this scenario (for logging).
   *  Undefined until the dialog fires. */
  lastConfirmText?: string;

  async open(path = '/contact_us'): Promise<void> {
    await this.page.goto(path);
    await this.dismissAdOverlay();
  }

  /**
   * Remove any Google "vignette" ad frame / overlay that slipped past the
   * network block, and clear the `#google_vignette` hash it leaves behind, so
   * a subsequent click isn't intercepted. Safe to call when no ad is present.
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
   *  a click can succeed while its navigation is in flight and `click()`
   *  still rejects (element detached) — snapshot the URL first and, if it
   *  moved (or the target went away), treat the click as done. */
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

  private async safeScrollIntoView(target: Locator): Promise<void> {
    await target.scrollIntoViewIfNeeded({ timeout: 3_000 }).catch(() => {
      /* element gone / page navigating */
    });
  }

  private async clickAlreadyLanded(target: Locator, urlBefore: string): Promise<boolean> {
    if (this.page.url() !== urlBefore) return true;
    return !(await target.isVisible().catch(() => false));
  }

  /**
   * Fill the Contact Us form from `fields` (keys mirror the .feature
   * data-table: name / email / subject / message / file) and click
   * "Submit", answering the `window.confirm("Press OK to proceed!")` the
   * submit raises according to `confirmIntent` ('accept' | 'dismiss').
   *
   * A blank cell is filled as "" so the browser's own required-field
   * validation fires on `email` — the behaviour the negative scenarios put
   * under test; those never reach the confirm dialog (the HTML5 check
   * blocks the submit first), so the handler simply goes unused. `file`,
   * when present, is resolved to an absolute path under the fixtures dir
   * and attached via setInputFiles.
   *
   * On accept the page re-renders /contact_us with the success box; on
   * dismiss the form is left as-is. Either way the browser stays on
   * /contact_us.
   *
   * The `page.on('dialog')` handler is one-shot (removes itself after the
   * first dialog) so scenarios don't leak listeners into one another.
   */
  async theVisitorSubmitsTheContactUsForm(
    fields: Record<string, string>,
    confirmIntent: 'accept' | 'dismiss',
    resolveFixture: (name: string) => string,
  ): Promise<void> {
    const onDialog = async (dialog: Dialog): Promise<void> => {
      this.page.off('dialog', onDialog);
      this.lastConfirmText = dialog.message();
      if (confirmIntent === 'accept') {
        await dialog.accept().catch(() => {});
      } else {
        await dialog.dismiss().catch(() => {});
      }
    };
    this.page.on('dialog', onDialog);

    await this.dismissAdOverlay();

    if ('name' in fields) await this.fName.fill(fields['name']);
    if ('email' in fields) await this.fEmail.fill(fields['email']);
    if ('subject' in fields) await this.fSubject.fill(fields['subject']);
    if ('message' in fields) await this.fMessage.fill(fields['message']);
    if ('file' in fields && fields['file'].trim() !== '') {
      await this.fFile.setInputFiles(resolveFixture(fields['file'].trim()));
    }

    await this.safeClick(this.submitButton);
    // Give the confirm dialog + the server round-trip a beat to settle so a
    // following assertion doesn't race the re-render.
    await this.page.waitForTimeout(800);
  }

  /** The green "Home" button on the success page. Captured live: navigates
   *  to https://automationexercise.com/. */
  async theVisitorClicksTheHomeButtonOnTheSuccessPage(): Promise<void> {
    await expect(this.homeButton).toBeVisible({ timeout: UI_TIMEOUT });
    await this.safeClick(this.homeButton);
  }

  /** The exact success-box text the site renders after an accepted submit.
   *  Captured live on /contact_us. */
  static readonly SUCCESS_MESSAGE = 'Success! Your details have been submitted successfully.';

  /**
   * Assert the green success box is visible with the site's success text.
   * Captured live: `Success! Your details have been submitted successfully.`
   * Text compared whitespace-normalised, case-insensitive (to survive any
   * CSS transform).
   */
  async expectSuccessMessage(): Promise<void> {
    const normalised = ContactUsPage.SUCCESS_MESSAGE.replace(/\s+/g, ' ');
    await expect(this.successBox).toBeVisible({ timeout: UI_TIMEOUT });
    await expect(this.successBox).toHaveText(new RegExp(escapeRegExp(normalised), 'i'), {
      timeout: UI_TIMEOUT,
    });
  }

  /**
   * Assert the success box is NOT shown (the confirm dialog was dismissed,
   * so nothing was submitted). Captured live: after a Cancel the
   * `.status.alert-success` node is absent / hidden and no success text
   * renders.
   */
  async expectSuccessMessageNotShown(): Promise<void> {
    // The node may not exist at all, or exist-but-hidden — both are "not
    // shown". Assert it is not visible, allowing a brief settle.
    await expect(this.successBox).toBeHidden({ timeout: UI_TIMEOUT });
  }

  /**
   * Assert the browser stayed on /contact_us (the form posts back to the
   * same URL for every observed path — success, dismiss, and HTML5-blocked).
   */
  async expectStillOnContactUsPage(): Promise<void> {
    await expect(this.page).toHaveURL(/\/contact_us(\?|#|$)/, { timeout: UI_TIMEOUT });
  }

  /**
   * Assert the `email` input is failing HTML5 constraint validation — via
   * the input's `validity` flags, not `validationMessage` (which varies by
   * engine). `kind` selects the flag: 'missing' -> valueMissing (blank
   * required field), 'type' -> typeMismatch (malformed address).
   */
  async expectEmailInvalid(kind: 'missing' | 'type'): Promise<void> {
    const expected = kind === 'missing' ? { valueMissing: true } : { typeMismatch: true };
    await expect
      .poll(
        () =>
          this.fEmail.evaluate((el) => {
            const v = (el as HTMLInputElement).validity;
            return { valueMissing: v.valueMissing, typeMismatch: v.typeMismatch, valid: v.valid };
          }),
        { timeout: UI_TIMEOUT, message: `email should be invalid (${kind})` },
      )
      .toEqual(expect.objectContaining(expected));
  }

  /**
   * Assert the `email` input is failing the HTML5 constraint that `message`
   * describes. `validationMessage` wording is engine-specific; the .feature
   * quotes Chrome's text for readability, so this maps the message to the
   * constraint kind ("… missing an '@' …" / "email address" -> typeMismatch;
   * "fill out this field" / "required" -> valueMissing) and checks the
   * `validity` flag, which is stable across engines.
   */
  async expectEmailConstraint(message: string): Promise<void> {
    const m = message.trim().toLowerCase();
    const kind: 'missing' | 'type' = /@|include an|email address/.test(m) ? 'type' : 'missing';
    await this.expectEmailInvalid(kind);
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
