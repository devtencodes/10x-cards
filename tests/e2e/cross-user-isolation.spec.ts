import { test, expect, type BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";

// Risk #2 (test-plan.md): regression coverage for cross-user isolation on
// flashcard/review-schedule data. RLS is already verified correct (see
// research.md) — this test locks that in place against a future
// regression (a new route forgetting RLS reliance, or an accidental
// service-role client), across both the by-id API mutation routes and the
// SSR listing pages.

// `.env` isn't loaded into this (separate) Node process automatically the
// way astro:env loads it for the app itself — needed below only for this
// spec's own direct, RLS-respecting Supabase client (see comment at its use
// site for why that's necessary).
process.loadEnvFile();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error("SUPABASE_URL/SUPABASE_KEY must be set in .env for this spec's direct RLS-respecting lookup.");
}

const USER_A = { email: "e2e-user-a@example.com", password: "e2e-password-1" };

test("a signed-in user cannot read, mutate, or see another user's flashcard/review-schedule data", async ({
  browser,
}) => {
  const uniqueFront = `E2E isolation check ${Date.now().toString()}`;
  const supabaseAsUserA = createClient<Database>(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

  const contextA = await browser.newContext({ storageState: "playwright/.auth/user-a.json" });
  const pageA = await contextA.newPage();
  let contextB: BrowserContext | undefined;

  try {
    // Arrange: seed one flashcard as user A through the real API route — no
    // AI call needed, save.ts accepts a pre-formed card directly.
    const saveResponse = await pageA.request.post("/api/flashcards/save", {
      data: { cards: [{ front: uniqueFront, back: "E2E isolation check — back", source: "ai_generated" }] },
    });
    expect(saveResponse.ok()).toBe(true);

    // save.ts's response carries only a count, never the inserted row's id,
    // and there's no GET API route to look it up through — the rendered
    // /flashcards list never exposes the id in the DOM either
    // (FlashcardListItem keeps it in closure state only). Read it back via a
    // direct Supabase client authenticated as user A: same anon key, same
    // `auth.uid() = user_id` RLS policy the app itself relies on — this is
    // test orchestration, not a bypass.
    const { error: signInError } = await supabaseAsUserA.auth.signInWithPassword(USER_A);
    if (signInError) throw signInError;
    const { data: seeded, error: lookupError } = await supabaseAsUserA
      .from("flashcards")
      .select("id")
      .eq("front", uniqueFront)
      .single();
    // .single()'s typed result is a discriminated union: a null `error` here
    // guarantees `seeded` is non-null, so there's nothing further to check.
    if (lookupError) throw lookupError;
    const flashcardId = seeded.id;

    // Act + assert, as user B: none of these should succeed.
    contextB = await browser.newContext({ storageState: "playwright/.auth/user-b.json" });
    const pageB = await contextB.newPage();

    const patchResponse = await pageB.request.patch(`/api/flashcards/${flashcardId}`, {
      data: { front: "hijacked front", back: "hijacked back" },
    });
    expect(patchResponse.status()).toBe(404);

    // A JSON body (even empty) is required here: Astro's built-in
    // CSRF/origin check (security.checkOrigin) rejects unsafe-method
    // requests with no Content-Type as a possible cross-site form
    // submission — a JSON body is exempt since no native HTML form can
    // produce that content-type. A real browser's own fetch() always sends
    // a same-origin Origin header and never hits this path; Playwright's
    // Node-based request API doesn't, so this is a test-only workaround,
    // not a production concern.
    const deleteResponse = await pageB.request.delete(`/api/flashcards/${flashcardId}`, { data: {} });
    expect(deleteResponse.status()).toBe(404);

    const rateResponse = await pageB.request.post(`/api/study/${flashcardId}`, {
      data: { rating: "remembered" },
    });
    expect(rateResponse.status()).toBe(404);

    await pageB.goto("/flashcards");
    await expect(pageB.getByText(uniqueFront)).toHaveCount(0);

    await pageB.goto("/study");
    await expect(pageB.getByText(uniqueFront)).toHaveCount(0);

    // Positive control: user A still sees their own card — proves the
    // isolation checks above aren't vacuously true (e.g. a broken query
    // that returns nothing for anyone).
    await pageA.goto("/flashcards");
    await expect(pageA.getByText(uniqueFront)).toBeVisible();
  } finally {
    // Close user B's context unconditionally — not just on the success
    // path — so a thrown assertion above (the exact scenario this test
    // exists to catch) doesn't leak it.
    if (contextB) await contextB.close();

    // Clean up the seeded flashcard *data* even if an assertion — or the
    // sign-in/lookup above — failed before `flashcardId` was ever known.
    // Deleting by `front` text (not id) via a fresh sign-in attempt covers
    // that case too; the two test accounts persist across runs, but the
    // rows they create should not (per .claude/skills/10x-e2e's cleanup
    // rule).
    const { error: cleanupSignInError } = await supabaseAsUserA.auth.signInWithPassword(USER_A);
    if (!cleanupSignInError) {
      await supabaseAsUserA.from("flashcards").delete().eq("front", uniqueFront);
    }
    await contextA.close();
  }
});
