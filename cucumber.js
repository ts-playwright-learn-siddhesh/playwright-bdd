// Cucumber profiles.
//   npm run cucumberTs                          all scenarios, chromium
//   BROWSER=firefox PARALLEL=0 npm run cucumberTs -- --name "<n>"   one, serial
//   npm run cucumberTs -- --profile ci          + retry, junit report
//
// PARALLEL (default 2, 0 = serial) sets worker count on both profiles.
// Report paths are keyed by BROWSER so concurrent engines don't clobber
// each other's reports/<browser>/*.
const PARALLEL = Number.parseInt(process.env.PARALLEL ?? '2', 10);
const parallel = Number.isFinite(PARALLEL) && PARALLEL >= 0 ? PARALLEL : 2;

const BROWSER = (process.env.BROWSER ?? 'chromium').trim().toLowerCase() || 'chromium';
const reportDir = `reports/${BROWSER}`;

const common = {
  import: ['src/support/**/*.ts', 'src/step-definitions/**/*.ts'],
  paths: ['src/features/**/*.feature'],
  format: ['summary', 'progress-bar', `html:${reportDir}/cucumber-report.html`],
  formatOptions: { snippetInterface: 'async-await' },
  publishQuiet: true,
  parallel,
};
module.exports = {
  default: common,
  ci: {
    ...common,
    format: ['summary', `html:${reportDir}/cucumber-report.html`, `junit:${reportDir}/junit.xml`],
    retry: 1,
  },
};
