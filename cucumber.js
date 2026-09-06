// Cucumber profiles. Run:  npm run cucumberTs
// One scenario:  npm run cucumberTs -- --name "<name>"
// CI profile:    npm run cucumberTs -- --profile ci
const common = {
  import: ['src/support/**/*.ts', 'src/step-definitions/**/*.ts'],
  paths: ['src/features/**/*.feature'],
  format: ['summary', 'progress-bar', 'html:reports/cucumber-report.html'],
  formatOptions: { snippetInterface: 'async-await' },
  publishQuiet: true,
};
module.exports = {
  default: common,
  ci: { ...common, format: ['summary', 'html:reports/cucumber-report.html', 'junit:reports/junit.xml'], retry: 1, parallel: 2 },
};
