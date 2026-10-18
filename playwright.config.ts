import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/ui',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: [
    { command: 'npm run dev -w @qbr/server', url: 'http://127.0.0.1:3001/api/health', reuseExistingServer: false, timeout: 30000 },
    { command: 'npm run dev -w @qbr/client', url: 'http://127.0.0.1:5173', reuseExistingServer: false, timeout: 30000 },
  ],
});
