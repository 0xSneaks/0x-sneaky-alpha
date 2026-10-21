// E2E: iPhone emulation. WebKit is the target engine (Safari); the Chromium project is a
// fallback for machines where the Playwright WebKit build cannot be downloaded.
import { defineConfig, devices } from '@playwright/test';

const iphone = devices['iPhone 15'];
const chromiumPath = process.env.PW_CHROMIUM_PATH;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4173/', trace: 'off' },
  webServer: [
    {
      command: 'npm run build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
      url: 'http://127.0.0.1:4173/',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    { command: 'node e2e/mock-server.mjs', url: 'http://127.0.0.1:4174/v1/models', reuseExistingServer: true },
  ],
  projects: [
    { name: 'webkit-iphone', use: { ...iphone } },
    {
      name: 'chromium-iphone',
      use: {
        ...iphone,
        browserName: 'chromium',
        launchOptions: chromiumPath ? { executablePath: chromiumPath } : {},
      },
    },
  ],
});
