import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 7_000 },
  reporter: [['list']],
  outputDir: './test-results',
  use: {
    baseURL: 'http://localhost:4322',
    actionTimeout: 10_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    // Astro 7 auto-backgrounds under agent harnesses unless --ignore-lock is set.
    command: 'npm run build && npm run preview -- --port 4322 --ignore-lock',
    url: 'http://localhost:4322',
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 120_000,
  },
});
