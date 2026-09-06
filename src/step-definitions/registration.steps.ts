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
 * The "New User Signup!" data table in the feature carries placeholder phrases
 * ("a fresh name", "a fresh email address"), not literals: automationexercise.com
 * rejects an e-mail that already has an account, so every run needs a brand-new
 * address. The When step below generates a unique e-mail via uniqueEmail() and a
 * stable display name, stashes BOTH on the World, and the final "Logged in as"
 * assertion reads the name back from the World — never a hard-coded string.
 */

/** Display name submitted in the "New User Signup!" block. Reused across runs
 *  (the site does not require the name to be unique); only the e-mail must be. */
const SIGNUP_NAME = 'Probe Tester';

Given('the visitor is on the Signup Login page', async function (this: PlaywrightWorld) {
  await this.pages.registration.open();
});

When(
  'the visitor starts a signup in the {string} block:',
  async function (this: PlaywrightWorld, _block: string, _table: DataTable) {
    // The feature's table values are placeholders — resolve them to real,
    // run-unique data here and remember what was actually submitted.
    const name = SIGNUP_NAME;
    const email = uniqueEmail('probe.tester@example.com');
    this.lastSignupName = name;
    this.logger.info(`starting signup as "${name}" <${email}>`);

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

Then('the message {string} is shown', async function (this: PlaywrightWorld, message: string) {
  this.logger.info(`asserting account-created message "${message}"`);
  await this.pages.registration.expectAccountCreated(message);
});

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
