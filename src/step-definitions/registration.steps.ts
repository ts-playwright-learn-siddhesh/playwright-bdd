import { Given, When, Then, DataTable } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { PlaywrightWorld } from '../support/world.js';
import { uniqueEmail } from '../support/data.js';

/**
 * Steps for src/features/registration.feature
 *
 * Bodies delegate to the RegistrationPage Page Object.
 * `async function` (not arrow) so Cucumber binds `this` (the World).
 * Assertions reflect the .feature as written — a site that disagrees fails here.
 *
 * The "New User Signup!" data table in the feature carries two kinds of value:
 *   - placeholder phrases ("a fresh name", "a fresh email address") — the
 *     positive flow needs a brand-new address every run, so the e-mail
 *     placeholder is resolved through uniqueEmail() here;
 *   - literal strings ("Probe Dup", "not-an-email", a blank cell) — the
 *     negative scenarios need the exact value submitted verbatim.
 * The one exception is the "already has an account" scenario: its
 * name-scoped Before hook (src/support/hooks/registration.hooks.ts) registers a
 * real account and pins the address on the World as `forcedSignupEmail`;
 * the signup step below submits THAT verbatim, ignoring the .feature's
 * placeholder literal, so the duplicate-rejection path is genuinely hit.
 *
 * Whatever was actually submitted is stashed on the World
 * (`lastSignupName` / `lastSignupEmail` / `lastBlankField`) so the later
 * Then steps assert what was sent, never a literal re-read from the table.
 */

/** Display name submitted in the "New User Signup!" block when the feature
 *  uses the "a fresh name" placeholder. Reused across runs (the site does
 *  not require the name to be unique); only the e-mail must be. */
const SIGNUP_NAME = 'Probe Tester';

/** Table cells that stand for "generate a fresh value", not a literal. */
const FRESH_NAME_PHRASES = new Set(['a fresh name']);
const FRESH_EMAIL_PHRASES = new Set(['a fresh email address', 'a fresh email', 'a unique email address']);

Given('the visitor is on the Signup Login page', async function (this: PlaywrightWorld) {
  await this.pages.registration.open();
});

When(
  'the visitor starts a signup in the {string} block:',
  async function (this: PlaywrightWorld, _block: string, table: DataTable) {
    const cells = Object.fromEntries(table.raw()) as Record<string, string>;
    const rawName = cells['name'] ?? '';
    const rawEmail = cells['email'] ?? '';

    // Name: a placeholder phrase -> the stable display name; anything else
    // (including a blank cell) -> submitted verbatim.
    const name = FRESH_NAME_PHRASES.has(rawName.trim()) ? SIGNUP_NAME : rawName;

    // Email, in priority order:
    //   1. a pinned address from a name-scoped Before hook (duplicate-email
    //      scenario) -> submit verbatim;
    //   2. a "fresh email" placeholder -> uniqueEmail();
    //   3. any other literal (a bad address, a blank cell) -> verbatim.
    let email: string;
    if (this.forcedSignupEmail) {
      email = this.forcedSignupEmail;
    } else if (FRESH_EMAIL_PHRASES.has(rawEmail.trim())) {
      email = uniqueEmail('probe.tester@example.com');
    } else {
      email = rawEmail;
    }

    this.lastSignupName = name;
    this.lastSignupEmail = email;
    this.logger.info(`starting signup as "${name}" <${email || '(blank)'}>`);

    await this.pages.registration.theVisitorStartsASignupInTheBlock({ name, email });
  },
);

Then('the visitor reaches the {string} page', async function (this: PlaywrightWorld, page: string) {
  await this.pages.registration.expectPage(page);
});

When(
  'the visitor submits the account information form:',
  async function (this: PlaywrightWorld, table: DataTable) {
    // table.raw() preserves blank cells as "" — the feature uses an empty
    // cell to mean "leave this optional field blank", so keep it verbatim.
    const fields = Object.fromEntries(table.raw()) as Record<string, string>;
    this.logger.debug('submitting account information form');
    // The page object fills every field and returns exactly what it put on
    // the page; stash that so the later Then steps assert what was actually
    // submitted, never a literal re-read from this table.
    this.lastAccountInfo = await this.pages.registration.theVisitorSubmitsTheAccountInformationForm(
      fields,
    );
    this.logger.info(
      `account info submitted: title=${this.lastAccountInfo.title} ` +
        `country=${this.lastAccountInfo.country} state=${this.lastAccountInfo.state} ` +
        `city=${this.lastAccountInfo.city} ` +
        `newsletter=${this.lastAccountInfo.newsletter} offers=${this.lastAccountInfo.offers} ` +
        `companyBlank=${this.lastAccountInfo.companyBlank} ` +
        `address2Blank=${this.lastAccountInfo.address2Blank}`,
    );
  },
);

When(
  'the visitor submits the account information form with {string} left blank:',
  async function (this: PlaywrightWorld, blankField: string, table: DataTable) {
    const fields = Object.fromEntries(table.raw()) as Record<string, string>;
    this.lastBlankField = blankField.trim();
    this.logger.info(`submitting account information form with "${this.lastBlankField}" left blank`);
    await this.pages.registration.theVisitorSubmitsTheAccountInformationFormWithLeftBlank(
      fields,
      this.lastBlankField,
    );
  },
);

Then('the message {string} is shown', async function (this: PlaywrightWorld, message: string) {
  const reg = this.pages.registration;

  // The feature reuses this phrasing for three different real-site outcomes.
  // Dispatch on what this scenario actually submitted:
  if (this.lastBlankField) {
    // account-information form, a required field left blank -> the browser's
    // constraint bubble on THAT field.
    this.logger.info(
      `asserting "${this.lastBlankField}" reports validation message "${message}"`,
    );
    await reg.expectFieldValidationMessage(this.lastBlankField, message);
    return;
  }

  if (/already exist/i.test(message)) {
    // duplicate e-mail -> the site's own red banner in the signup block.
    this.logger.info(`asserting signup-block error "${message}"`);
    await reg.expectSignupBlockError(message);
    return;
  }

  if (/please (fill out this field|include an '@')/i.test(message)) {
    // blank / malformed value in the "New User Signup!" block -> the browser's
    // constraint bubble on whichever field was invalid. The feature's
    // scenarios leave exactly one of name / email bad.
    const badKey = this.lastSignupName === '' ? 'name' : 'email';
    this.logger.info(`asserting "${badKey}" reports validation message "${message}"`);
    await reg.expectFieldValidationMessage(badKey, message);
    return;
  }

  // default: the positive flow's "ACCOUNT CREATED!" confirmation.
  this.logger.info(`asserting account-created message "${message}"`);
  await reg.expectAccountCreated(message);
});

Then(
  'the visitor does not reach the {string} page',
  async function (this: PlaywrightWorld, page: string) {
    this.logger.info(`asserting the visitor did NOT reach the "${page}" page`);
    if (page === 'Enter Account Information') {
      await this.pages.registration.expectAccountInfoFormNotReached();
      return;
    }
    // generic fallback: URL must not match the named page's fragment.
    await expect(this.page).not.toHaveURL(new RegExp(escapeRegExp(page)));
  },
);

Then(
  'the visitor stays on the {string} page',
  async function (this: PlaywrightWorld, page: string) {
    this.logger.info(`asserting the visitor stayed on the "${page}" page`);
    if (page === 'Signup Login') {
      await this.pages.registration.expectStillOnSignupBlockPage();
      return;
    }
    if (page === 'Enter Account Information') {
      await this.pages.registration.expectStillOnAccountInfoPage();
      return;
    }
    await this.pages.registration.expectPage(page);
  },
);

When('the visitor continues from the account-created page', async function (this: PlaywrightWorld) {
  await this.pages.registration.theVisitorContinuesFromTheAccountCreatedPage();
});

Then(
  'the header shows {string} the registered name',
  async function (this: PlaywrightWorld, prefix: string) {
    const name = this.lastSignupName;
    expect(name, 'a signup step must run before this assertion').toBeTruthy();
    this.logger.info(`asserting header shows "${prefix} ${name}"`);
    // e.g. prefix = "Logged in as", name = "Probe Tester"
    await expect(this.page.getByText(`${prefix} ${name}`, { exact: false }).first()).toBeVisible({
      timeout: 15_000,
    });
  },
);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
