import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests (`npm run test:e2e`), against the local test database in .env.localdb – never
 * Neon. Starts `npm run dev:localdb` unless a dev server is already running on port 3000.
 * The local Postgres must be up first: `npm run db:dev`.
 */
export default defineConfig({
  testDir: "e2e",
  // The dev server compiles each page on first visit, which can take a while
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run dev:localdb",
    url: "http://localhost:3000/en",
    reuseExistingServer: true,
    timeout: 240_000,
  },
});
