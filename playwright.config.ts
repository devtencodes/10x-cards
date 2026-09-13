import { defineConfig, devices } from "@playwright/test";

// This project's only local dev server is `astro dev` (see package.json,
// README.md) — no server.port override anywhere in astro.config.mjs, so the
// effective default is Astro's own port 4321. `supabase/config.toml`'s
// site_url/additional_redirect_urls reference port 3000, a pre-existing,
// unrelated mismatch left untouched by this bootstrap (see plan.md's
// "What We're NOT Doing").
const BASE_URL = "http://localhost:4321";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  // Starts the real dev server against the local Supabase stack, which must
  // already be running (`npx supabase start`) — this config only starts the
  // app, never the database.
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: "setup",
      testMatch: /global\.setup\.ts/,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],
});
