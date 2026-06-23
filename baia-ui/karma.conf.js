module.exports = function (config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-jasmine-html-reporter'),
      require('karma-coverage'),
      require('@angular-devkit/build-angular/plugins/karma')
    ],
    client: { jasmine: { random: true }, clearContext: false },
    jasmineHtmlReporter: { suppressAll: true },
    coverageReporter: { dir: require('path').join(__dirname, './coverage/baia-ui'), subdir: '.', reporters: [{ type: 'html' }, { type: 'text-summary' }, { type: 'json-summary', file: 'coverage-summary.json' }], check: { global: { statements: 85, branches: 80, functions: 80, lines: 85 } } },
    reporters: ['progress', 'kjhtml'],
    browsers: [process.env.CI ? 'ChromeHeadlessCI' : 'ChromeHeadless'],
    customLaunchers: {
      ChromeHeadlessCI: {
        base: 'ChromeHeadless',
        flags: ['--no-sandbox', '--disable-gpu', '--disable-software-rasterizer', '--disable-dev-shm-usage']
      }
    },
    restartOnFileChange: true
  });
};
