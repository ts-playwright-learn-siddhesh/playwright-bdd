import { Before, ITestCaseHookParameter } from '@cucumber/cucumber';
import { PlaywrightWorld } from '../world.js';
import { uniqueEmail } from '../data.js';

/**
 * Scenario-scoped setup for src/features/registration.feature.
 *
 * Loads AFTER src/support/hooks/global.hooks.ts (Cucumber runs hook files in
 * filename order and "global.hooks.ts" sorts before "registration.hooks.ts"),
 * so the global `Before` in global.hooks.ts has already run `this.init()` —
 * `this.page` and `this.pages` exist here.
 *
 * cucumber-js has no built-in "run this hook only for scenario X by name"
 * filter — `Before({ name })` only *labels* the hook, it does not scope it,
 * and `Before({ tags })` needs a tag we can't add without editing the
 * .feature. So this is a plain `Before` that inspects the pickle name and
 * returns immediately for every scenario except the one it targets.
 */

const DUPLICATE_EMAIL_SCENARIO =
  'Signing up with an email that already has an account is rejected';

/**
 * "Signing up with an email that already has an account is rejected".
 *
 * The scenario needs an address that ALREADY has an account — uniquifying it
 * would defeat the test. So this hook creates one for real through the live
 * UI: a fresh `uniqueEmail()` is registered, the full account-information
 * form is submitted, the browser lands on /account_created, then logs out.
 * The address is pinned on the World as `forcedSignupEmail`; the signup
 * `When` step submits it verbatim, and the site returns
 * "Email Address already exist!".
 */
Before(async function (this: PlaywrightWorld, scenario: ITestCaseHookParameter) {
  if (scenario.pickle?.name !== DUPLICATE_EMAIL_SCENARIO) return;

  const email = uniqueEmail('probe.dup@example.com');
  const name = 'Probe Dup';
  this.logger.info(`pre-creating an account to collide with: <${email}>`);

  const reg = this.pages.registration;

  // Step 1 — "New User Signup!" block on /login.
  await reg.open();
  await reg.theVisitorStartsASignupInTheBlock({ name, email });
  await reg.expectPage('Enter Account Information');

  // Step 2 — the account-information form. Values mirror the positive
  // scenario's; only the e-mail has to be unique and it already is.
  await reg.theVisitorSubmitsTheAccountInformationForm({
    title: 'Mr',
    password: 'Probe#Pass123',
    'date of birth day': '15',
    'date of birth month': '6',
    'date of birth year': '1990',
    'first name': 'Probe',
    'last name': 'Dup',
    address: '123 Probe Street',
    country: 'United States',
    state: 'California',
    city: 'San Diego',
    zipcode: '92101',
    'mobile number': '5551234567',
  });
  await reg.expectAccountCreated('ACCOUNT CREATED!');
  await reg.theVisitorContinuesFromTheAccountCreatedPage();

  // Log out so the scenario starts from a clean, signed-out session.
  await this.page.goto('/logout');

  // Pin it for the signup When step.
  this.forcedSignupEmail = email;
  this.logger.info(`pinned forcedSignupEmail=<${email}>`);
});
