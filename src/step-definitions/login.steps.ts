import { Given, When, Then, DataTable } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { PlaywrightWorld } from '../support/world.js';

/**
 * Steps for src/features/login.feature
 *
 * Bodies delegate to the LoginPage Page Object.
 * `async function` (not arrow) so Cucumber binds `this` (the World).
 * Assertions reflect the .feature as written — a site that disagrees fails here.
 *
 * The seeded credential pair: src/support/hooks/login.hooks.ts runs a
 * `@login`-tagged `Before` that registers a real account through the live
 * signup UI, logs it out, and pins `loginAccountEmail` / `loginAccountPassword`
 * / `loginAccountName` on the World. The "submits the login form" data table
 * uses placeholder phrases ("the registered account email/password") for those
 * pinned values; every other cell (a literal bad address, a blank cell) is
 * submitted verbatim. Whatever was actually submitted is stashed on the World
 * (`lastLoginEmail` / `lastLoginPassword`) so later Then steps assert what was
 * sent, never a literal re-read from the table.
 *
 * `the visitor reaches the {string} page` and `the message {string} is shown`
 * are defined once, in registration.steps.ts (Cucumber errors on ambiguous
 * defs); the message step branches into LoginPage when `lastLoginEmail` is set.
 */

/** Table cells that stand for the seeded credential pair, not a literal. */
const REGISTERED_EMAIL_PHRASES = new Set([
  'the registered account email',
  'the registered account e-mail',
]);
const REGISTERED_PASSWORD_PHRASES = new Set(['the registered account password']);

Given(
  'a registered account exists and its session is logged out',
  async function (this: PlaywrightWorld) {
    // The @login Before hook (login.hooks.ts) has already created the account
    // via the live signup UI and logged it out. This step just confirms the
    // pinned credential pair is present for the When steps below.
    expect(
      this.loginAccountEmail,
      'the @login Before hook must seed loginAccountEmail before this step',
    ).toBeTruthy();
    expect(this.loginAccountPassword, 'the @login Before hook must seed loginAccountPassword').toBeTruthy();
    this.logger.info(
      `registered account ready + logged out: <${this.loginAccountEmail}>`,
    );
  },
);

Given('the visitor is on the {string} page', async function (this: PlaywrightWorld, page: string) {
  // login.feature's Background names the "Login to your account" page; open it.
  this.logger.info(`opening the "${page}" page`);
  await this.pages.login.open('/login');
  await this.pages.login.expectPage(page);
});

When(
  'the visitor submits the login form:',
  async function (this: PlaywrightWorld, table: DataTable) {
    // table.raw() keeps blank cells as "" — the feature uses an empty cell to
    // mean "leave this field blank" so the browser's own required-field
    // validation fires.
    const cells = Object.fromEntries(table.raw()) as Record<string, string>;
    const rawEmail = cells['email'] ?? '';
    const rawPassword = cells['password'] ?? '';

    const email = REGISTERED_EMAIL_PHRASES.has(rawEmail.trim())
      ? (this.loginAccountEmail as string)
      : rawEmail;
    const password = REGISTERED_PASSWORD_PHRASES.has(rawPassword.trim())
      ? (this.loginAccountPassword as string)
      : rawPassword;

    this.lastLoginEmail = email;
    this.lastLoginPassword = password;
    this.logger.info(
      `submitting login form <${email || '(blank)'}> / ${password ? '(password)' : '(blank)'}`,
    );

    await this.pages.login.theVisitorSubmitsTheLoginForm({ email, password });
  },
);

Given(
  'the visitor has signed in with the registered account',
  async function (this: PlaywrightWorld) {
    const email = this.loginAccountEmail as string;
    const password = this.loginAccountPassword as string;
    expect(email, 'the @login Before hook must seed loginAccountEmail').toBeTruthy();
    this.lastLoginEmail = email;
    this.lastLoginPassword = password;
    this.logger.info(`signing in with the seeded account <${email}>`);
    await this.pages.login.theVisitorSubmitsTheLoginForm({ email, password });
    // Observed live: a correct pair lands on the home page with the header
    // "Logged in as <name>".
    await this.pages.login.expectPage('home');
    await this.pages.login.expectLoggedInAs('Logged in as', this.loginAccountName as string);
  },
);

When('the visitor logs out', async function (this: PlaywrightWorld) {
  this.logger.info('clicking the header Logout link');
  await this.pages.login.theVisitorLogsOut();
});

Then(
  'the header shows {string} the registered account name',
  async function (this: PlaywrightWorld, prefix: string) {
    const name = this.loginAccountName;
    expect(name, 'the @login Before hook must seed loginAccountName').toBeTruthy();
    this.logger.info(`asserting header shows "${prefix} ${name}"`);
    await this.pages.login.expectLoggedInAs(prefix, name as string);
  },
);

Then(
  'the header shows the {string} link',
  async function (this: PlaywrightWorld, label: string) {
    this.logger.info(`asserting header shows the "${label}" link`);
    await this.pages.login.expectHeaderSignupLoginLink(label);
  },
);

Then(
  'the email field is reported invalid for a missing value',
  async function (this: PlaywrightWorld) {
    this.lastLoginInvalidField = 'email';
    this.logger.info('asserting the email field reports validity.valueMissing');
    await this.pages.login.expectFieldValidationMessage('email', 'value missing');
  },
);

Then(
  'the password field is reported invalid for a missing value',
  async function (this: PlaywrightWorld) {
    this.lastLoginInvalidField = 'password';
    this.logger.info('asserting the password field reports validity.valueMissing');
    await this.pages.login.expectFieldValidationMessage('password', 'value missing');
  },
);

Then(
  'the email field is reported invalid for a type mismatch',
  async function (this: PlaywrightWorld) {
    this.lastLoginInvalidField = 'email';
    this.logger.info('asserting the email field reports validity.typeMismatch');
    await this.pages.login.expectFieldValidationMessage('email', 'email @ mismatch');
  },
);
