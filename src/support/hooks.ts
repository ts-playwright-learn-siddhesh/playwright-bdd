import {
  Before, After, BeforeAll, AfterAll, Status, setDefaultTimeout, ITestCaseHookParameter,
} from '@cucumber/cucumber';
import { PlaywrightWorld } from './world.js';
import { scenarioLogger } from './logger.js';

setDefaultTimeout(60_000);

BeforeAll(async function () {
  // suite-wide setup
});

Before(async function (this: PlaywrightWorld, scenario: ITestCaseHookParameter) {
  this.logger = scenarioLogger(scenario.pickle?.name ?? 'unknown');
  this.logger.info('scenario started');
  await this.init();
});

After(async function (this: PlaywrightWorld, scenario: ITestCaseHookParameter) {
  const status = scenario.result?.status;
  if (status === Status.FAILED && this.page) {
    this.logger?.error(`scenario failed: ${scenario.pickle?.name}`);
    this.attach(await this.page.screenshot({ fullPage: true }), 'image/png');
  }
  this.logger?.info(`scenario finished: ${status}`);
  await this.destroy();
});

AfterAll(async function () {
  // suite-wide teardown
});
