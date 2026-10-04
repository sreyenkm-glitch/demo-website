import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const env = { DATABASE_URL: "file:./data/e2e.db" };

export default defineConfig({
  testDir: "./tests",
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", ignoreHTTPSErrors: true },
  projects: [{ name: "mobile", use: { ...devices["Pixel 7"], channel: undefined } }],
  webServer: {
    command: `npx tsx scripts/migrate.ts --fresh && npx tsx scripts/seed.ts && npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 180_000,
    reuseExistingServer: false,
    env,
  },
});
