import { Given, When, Then, DataTable } from '@cucumber/cucumber';
import { PlaywrightWorld } from '../support/world.js';
import { uniqueEmail, fixturePath } from '../support/data.js';

/**
 * Steps for src/features/contact-us.feature
 *
 * Every step here is Contact-Us-specific and self-contained: it delegates
 * straight to the ContactUsPage Page Object, with no branching on hidden
 * World state and no phrasing shared with login/registration. `async
 * function` (not arrow) so Cucumber binds `this` (the World).
 *
 * The data table carries the probe values verbatim from the .feature. The
 * `email` cell is a unique-by-nature value (the feature uses readable
 * literals like `probe.user@example.com`); the positive paths route it
 * through `uniqueEmail()` so re-runs don't depend on the site's dedup
 * behaviour. The HTML5-block negatives (blank cell, "not-an-email") submit
 * their literal verbatim — that IS the value under test.
 *
 * The confirm dialog ("Press OK to proceed!"): the submit step names how
 * the visitor answers it ("accepting" / "dismissing"), so the intent is
 * passed into the page object before the dialog is raised — no look-ahead,
 * no shared state.
 */

/** The literal email cell is unique-by-nature. For a positive submission
 *  swap it for a fresh address, keeping its readable prefix. The
 *  HTML5-block scenarios (blank cell, "not-an-email") submit verbatim. */
function resolveEmail(raw: string): string {
  const v = raw.trim();
  if (v === '') return ''; // blank-email negative — submit verbatim
  if (!/@/.test(v)) return v; // malformed-email negative — submit verbatim
  return uniqueEmail(v); // positive path — uniquify, keeping the prefix
}

async function submitContactForm(
  world: PlaywrightWorld,
  table: DataTable,
  confirmIntent: 'accept' | 'dismiss',
): Promise<void> {
  // table.raw() keeps a blank cell as "" — the feature uses an empty `email`
  // cell to mean "leave it blank so the browser's required-field validation
  // fires".
  const cells = Object.fromEntries(table.raw()) as Record<string, string>;
  const fields: Record<string, string> = {};
  for (const key of ['name', 'subject', 'message', 'file'] as const) {
    if (key in cells) fields[key] = cells[key];
  }
  fields['email'] = resolveEmail(cells['email'] ?? '');

  world.logger.info(
    `submitting Contact Us form <${fields['email'] || '(blank)'}> ` +
      `(confirm: ${confirmIntent})` +
      ('file' in fields ? ` with file "${fields['file']}"` : ''),
  );
  await world.pages.contactUs.theVisitorSubmitsTheContactUsForm(fields, confirmIntent, fixturePath);
}

Given('the visitor is on the Contact Us page', async function (this: PlaywrightWorld) {
  this.logger.info('opening the Contact Us page');
  await this.pages.contactUs.open('/contact_us');
  await this.pages.contactUs.expectPage('Contact Us');
});

When(
  'the visitor submits the Contact Us form, accepting the confirmation:',
  async function (this: PlaywrightWorld, table: DataTable) {
    await submitContactForm(this, table, 'accept');
  },
);

When(
  'the visitor submits the Contact Us form, dismissing the confirmation:',
  async function (this: PlaywrightWorld, table: DataTable) {
    await submitContactForm(this, table, 'dismiss');
  },
);

Then('the Contact Us form shows the success message', async function (this: PlaywrightWorld) {
  this.logger.info('asserting the Contact Us success box is shown');
  await this.pages.contactUs.expectStillOnContactUsPage();
  await this.pages.contactUs.expectSuccessMessage();
});

Then(
  'the Contact Us form does not show the success message',
  async function (this: PlaywrightWorld) {
    this.logger.info('asserting the Contact Us success box is NOT shown');
    await this.pages.contactUs.expectStillOnContactUsPage();
    await this.pages.contactUs.expectSuccessMessageNotShown();
  },
);

Then(
  'the Contact Us email field is reported invalid for a missing value',
  async function (this: PlaywrightWorld) {
    this.logger.info('asserting the Contact Us email field reports validity.valueMissing');
    await this.pages.contactUs.expectStillOnContactUsPage();
    await this.pages.contactUs.expectEmailInvalid('missing');
  },
);

Then(
  'the Contact Us email field is reported invalid for a type mismatch',
  async function (this: PlaywrightWorld) {
    this.logger.info('asserting the Contact Us email field reports validity.typeMismatch');
    await this.pages.contactUs.expectStillOnContactUsPage();
    await this.pages.contactUs.expectEmailInvalid('type');
  },
);

Then(
  'the browser constraint bubble reads {string}',
  async function (this: PlaywrightWorld, message: string) {
    // Engine-specific wording; the .feature quotes Chrome's for readability.
    // Assert the email input is failing the constraint the message describes,
    // not the literal string (which differs on Firefox / WebKit).
    this.logger.info(`asserting the browser constraint bubble corresponds to "${message}"`);
    await this.pages.contactUs.expectEmailConstraint(message);
  },
);

Given(
  'the visitor has submitted the Contact Us form and seen the success message:',
  async function (this: PlaywrightWorld, table: DataTable) {
    // Precondition for the "Home button" scenario: open the page, fill +
    // submit with the confirm ACCEPTED, and confirm the green success box
    // rendered — then the When can click "Home".
    await this.pages.contactUs.open('/contact_us');
    await this.pages.contactUs.expectPage('Contact Us');
    await submitContactForm(this, table, 'accept');
    await this.pages.contactUs.expectSuccessMessage();
  },
);

When(
  'the visitor clicks the Home button on the success page',
  async function (this: PlaywrightWorld) {
    this.logger.info('clicking the Home button on the Contact Us success page');
    await this.pages.contactUs.theVisitorClicksTheHomeButtonOnTheSuccessPage();
  },
);
