import { Before, ITestCaseHookParameter } from '@cucumber/cucumber';
import { PlaywrightWorld } from '../world.js';
import { uniqueEmail } from '../data.js';

/**
 * Scenario-scoped setup for src/features/login.feature.
 *
 * Loads AFTER src/support/hooks/global.hooks.ts (Cucumber runs hook files in
 * filename order and "global.hooks.ts" sorts before "login.hooks.ts"), so the
 * global `Before` has already run `this.init()` — `this.page` / `this.pages`
 * exist here.
 *
 * The feature's Background is:
 *   Given a registered account exists and its session is logged out
 *   And the visitor is on the "Login to your account" page
 * The first line needs a REAL account whose e-mail + password are a genuine,
 * working credential pair (the positive scenario signs in with it). Uniquifying
 * it at submit time is not enough — the account has to actually exist on the
 * site first. So a `@login`-tagged hook creates one for real through the live
 * signup UI (mirroring registration.feature's duplicate-email hook).
 *
 * SEED ONCE PER WORKER, not per scenario.
 * Cucumber parallel workers are separate processes; module-level state is
 * per-worker. Seeding a throwaway account for EVERY @login scenario means
 * ~8 concurrent signups per worker (~6 workers under `test:all:parallel` =
 * dozens of concurrent live signups), which lags automationexercise.com hard
 * enough that a click's navigation lands before the next step's waits expect
 * it — a non-deterministic race that failed 2 scenarios per parallel run.
 * The negative @login scenarios only need an account to EXIST; scenarios 1, 2
 * and 8 reuse ONE credential pair. So the signup runs at most once per worker
 * (the first @login scenario that worker picks up); every later @login
 * scenario in the same worker reuses the memoized pinned creds and does no
 * browser signup at all. Each scenario still gets its own fresh, logged-out
 * browser context from the global `Before`'s `this.init()`.
 *
 * `Before({ tags })` DOES scope a hook (unlike `Before({ name })`), and the
 * feature carries a `@login` tag, so this runs for every login scenario and
 * nothing else.
 */

/** Password + display name for the seeded login account. Reused across runs —
 *  the site does not require them to be unique, only the e-mail must be. */
const SEED_PASSWORD = 'Login#Probe123';
const SEED_NAME = 'Login Probe';

/** Per-worker memo of the seeded credential pair. Populated by the first
 *  @login scenario this worker process runs; reused by every later one. */
interface SeededLogin {
  email: string;
  password: string;
  name: string;
}
let seededLogin: SeededLogin | undefined;
/** In-flight seed promise, so two scenarios that somehow overlap in one
 *  worker don't both run the signup. */
let seedingInFlight: Promise<SeededLogin> | undefined;

async function seedAccountViaSignup(world: PlaywrightWorld): Promise<SeededLogin> {
  const email = uniqueEmail('login.probe@example.com');
  world.logger.info(`seeding a real account for login (once per worker): <${email}>`);

  const reg = world.pages.registration;

  // Step 1 — "New User Signup!" block on /login.
  await reg.open();
  await reg.theVisitorStartsASignupInTheBlock({ name: SEED_NAME, email });
  await reg.expectPage('Enter Account Information');

  // Step 2 — the account-information form. Values mirror registration's
  // positive scenario; only the e-mail has to be unique and it already is.
  await reg.theVisitorSubmitsTheAccountInformationForm({
    title: 'Mr',
    password: SEED_PASSWORD,
    'date of birth day': '15',
    'date of birth month': '6',
    'date of birth year': '1990',
    'first name': 'Login',
    'last name': 'Probe',
    address: '123 Probe Street',
    country: 'United States',
    state: 'California',
    city: 'San Diego',
    zipcode: '92101',
    'mobile number': '5551234567',
  });
  await reg.expectAccountCreated('ACCOUNT CREATED!');
  await reg.theVisitorContinuesFromTheAccountCreatedPage();

  // Log this context out so, if a scenario happens to reuse it, it starts
  // signed-out. (Later scenarios get a brand-new context from this.init()
  // anyway, so this only matters for the seeding scenario itself.)
  await world.page.goto('/logout');

  world.logger.info(`seeded login account pinned for this worker: <${email}>`);
  return { email, password: SEED_PASSWORD, name: SEED_NAME };
}

// The seeding path drives the full live signup flow (5 page loads + form
// fills). Under `test:all:parallel` all three engines hit signup at once and
// automationexercise.com slows right down — the default 60s hook timeout can
// be too tight for the ONE scenario per worker that does the seed. Give this
// hook its own generous budget; the memo means it's paid at most once per
// worker anyway. Reuse scenarios log a single line and finish in ms.
Before(
  { tags: '@login', timeout: 180_000 },
  async function (this: PlaywrightWorld, _scenario: ITestCaseHookParameter) {
    if (!seededLogin) {
      if (!seedingInFlight) {
        seedingInFlight = seedAccountViaSignup(this).then((s) => {
          seededLogin = s;
          return s;
        });
      }
      await seedingInFlight;
    } else {
      this.logger.info(`reusing this worker's seeded login account: <${seededLogin.email}>`);
    }

    // Pin the memoized pair on the World for the Background `Given` + the login
    // `When` step. (seededLogin is guaranteed set here.)
    this.loginAccountEmail = seededLogin!.email;
    this.loginAccountPassword = seededLogin!.password;
    this.loginAccountName = seededLogin!.name;
  },
);
