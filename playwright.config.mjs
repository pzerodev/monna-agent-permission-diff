import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir: './browser-tests',
  testMatch: '**/*.spec.mjs',
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  use: {
    browserName: 'chromium',
    baseURL: 'http://127.0.0.1:8432',
    acceptDownloads: true,
  },
  webServer: {
    command: 'node preview.mjs',
    url: 'http://127.0.0.1:8432',
    reuseExistingServer: false,
  },
});
