import { defineConfig } from '@playwright/test';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const BAIA_SERVER_DIST = path.join(ROOT, 'baia-server', 'dist');
const CREDENTIAL_ENCRYPTION_KEY = 'e2e-test-key-padding-32-chars-ok!';

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',

  use: {
    baseURL: 'http://localhost:3001',
  },

  webServer: [
    {
      command: 'node e2e/helpers/mock-mycms-server.mjs',
      url: 'http://localhost:4001',
      cwd: ROOT,
      reuseExistingServer: !process.env['CI'],
      stdout: 'pipe',
    },
    {
      command: 'node e2e/helpers/mock-confluence-server.mjs',
      url: 'http://localhost:4002/wiki/rest/api/content',
      cwd: ROOT,
      reuseExistingServer: !process.env['CI'],
      stdout: 'pipe',
    },
    {
      command: `node ${path.join(BAIA_SERVER_DIST, 'e2e-server.js')}`,
      url: 'http://localhost:3001/api/runs',
      cwd: ROOT,
      reuseExistingServer: !process.env['CI'],
      stdout: 'pipe',
      env: {
        PORT: '3001',
        CREDENTIAL_ENCRYPTION_KEY,
        NODE_ENV: 'test',
      },
    },
  ],
});
