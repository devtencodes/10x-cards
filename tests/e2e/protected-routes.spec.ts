import { test, expect } from "@playwright/test";
import { PROTECTED_ROUTES } from "@/lib/protected-routes";

// Risk #2 (test-plan.md #3): a protected page ships without joining
// PROTECTED_ROUTES, or a session-handling change breaks redirect/
// persistence. Iterating the real, exported array (rather than a
// hand-duplicated list) is what makes this test automatically stay correct
// as routes are added — the exact failure mode this risk worries about.

test.describe("protected routes — signed out", () => {
  for (const route of PROTECTED_ROUTES) {
    test(`redirects ${route} to /auth/signin when signed out`, async ({ page }) => {
      await page.goto(route);
      expect(new URL(page.url()).pathname).toBe("/auth/signin");
    });
  }

  test("does not redirect / when signed out", async ({ page }) => {
    await page.goto("/");
    expect(new URL(page.url()).pathname).toBe("/");
  });
});

test.describe("protected routes — signed in", () => {
  test.use({ storageState: "playwright/.auth/user-a.json" });

  for (const route of PROTECTED_ROUTES) {
    test(`loads ${route} without redirecting when signed in`, async ({ page }) => {
      await page.goto(route);
      expect(new URL(page.url()).pathname).toBe(route);
    });
  }
});
