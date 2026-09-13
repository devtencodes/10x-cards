import { test as setup, type Page } from "@playwright/test";

// Two fixed accounts, reused across every local run (never deleted — see
// plan.md's "Test-user lifecycle" decision). Since Supabase's local stack
// has `enable_confirmations = false` (supabase/config.toml), a fresh signup
// is immediately an active, usable session. On a second-or-later run these
// accounts already exist, so signup fails and we fall back to signing in
// with the same credentials.
const USER_A = { email: "e2e-user-a@example.com", password: "e2e-password-1" };
const USER_B = { email: "e2e-user-b@example.com", password: "e2e-password-2" };

/**
 * Signs up with the given credentials, falling back to sign-in if the
 * account already exists.
 *
 * Both `/api/auth/signup` and `/api/auth/signin` always respond with a 302
 * redirect — success and failure are distinguished only by the resulting
 * URL (`?error=...` on failure), never by status code. So "this account
 * already exists" isn't an HTTP error to catch; it's the signup form's own
 * failure redirect, which we detect by inspecting the landed URL's query
 * string, then retry as a sign-in instead.
 */
async function submitSignup(page: Page, email: string, password: string) {
  await page.goto("/auth/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  // Success lands on /auth/confirm-email (session cookies are already set
  // by then — enable_confirmations=false makes signUp() active immediately,
  // the redirect is purely a UI artifact); failure lands back on
  // /auth/signup with an `error` query param. Either way, wait for one of
  // the two known destinations rather than a fixed timeout.
  await page.waitForURL((url) => url.pathname === "/auth/confirm-email" || url.searchParams.has("error"));
}

async function submitSignin(page: Page, email: string, password: string) {
  await page.goto("/auth/signin");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Success lands on "/"; failure lands back on /auth/signin with `error`.
  await page.waitForURL((url) => url.pathname === "/" || url.searchParams.has("error"));
}

async function ensureSignedIn(page: Page, email: string, password: string) {
  await submitSignup(page, email, password);

  if (new URL(page.url()).searchParams.has("error")) {
    // Account already exists from a prior run — fall back to signing in.
    await submitSignin(page, email, password);

    if (new URL(page.url()).searchParams.has("error")) {
      throw new Error(
        `Could not sign up or sign in as ${email} — check that the local Supabase stack is running and reachable.`,
      );
    }
  }
}

setup("authenticate as user A", async ({ page }) => {
  await ensureSignedIn(page, USER_A.email, USER_A.password);
  await page.context().storageState({ path: "playwright/.auth/user-a.json" });
});

setup("authenticate as user B", async ({ page }) => {
  await ensureSignedIn(page, USER_B.email, USER_B.password);
  await page.context().storageState({ path: "playwright/.auth/user-b.json" });
});
