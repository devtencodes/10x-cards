# Bootstrap Playwright and Prove Cross-User Access Control End-to-End — Implementation Plan

## Overview

Bootstrap Playwright into this repo — which has zero tests of any kind today — and deliver two e2e specs that prove `context/foundation/test-plan.md` rollout Phase 1's two risks: risk #2 (cross-user isolation on flashcard/review-schedule data — regression coverage for an already-correct control) and risk #3 (protected-route/session gating). This is also this project's first test satisfying the "at least one test verifying behavior from the user's perspective" requirement.

## Current State Analysis

- Zero test infrastructure exists: no `@playwright/test`, no test script, no `*.spec.ts`, no `playwright.config.*`, no seed mechanism, no `scripts/`/`fixtures/` directory (`research.md`).
- `src/middleware.ts:4` — `PROTECTED_ROUTES` is a non-exported flat array (`["/dashboard", "/generate", "/flashcards", "/study"]`), gated by `pathname.startsWith(route)`, redirecting to `/auth/signin` with no return-to param. This array has grown three times already (once per feature slice) with nothing guarding against a fourth omission.
- Risk #2's original framing overstated an actual gap: 8/8 RLS policies exist and are correctly scoped (`auth.uid() = user_id`) on both `flashcards` and `review_schedules`; zero service-role key usage anywhere in the codebase; this exact control has been manually verified and reviewed three separate times across F-01/S-03/S-04. `test-plan.md` §2 was already corrected during research to frame this as regression coverage for a verified-correct control, not an open vulnerability.
- Auth is form-POST + 302-redirect based, not JSON: `src/pages/api/auth/signup.ts` redirects to `/auth/confirm-email` on success or `/auth/signup?error=<message>` on failure; `signin.ts` redirects to `/` on success or `/auth/signin?error=<message>` on failure. `supabase/config.toml:221` sets `enable_confirmations = false` locally, so a successful signup is immediately an active, usable session — no email step needed.
- `src/pages/api/flashcards/save.ts` accepts a pre-formed `{ front, back, source }` payload and persists it directly — no AI/OpenRouter call required, making it the cheapest way to seed a real flashcard row for a test user.
- `astro dev` (the only local dev script, `npm run dev`) defaults to port 4321 (no `server.port` override anywhere). `supabase/config.toml`'s `site_url`/`additional_redirect_urls` reference port 3000 — a pre-existing, unrelated bug, deliberately left untouched by this plan (see What We're NOT Doing).
- `.claude/skills/10x-e2e` detects "Playwright ready" via a single glob (`playwright.config.*` or `*.spec.ts`); expects (not enforces) a `tests/e2e/<feature>.spec.ts` layout, `storageState`-based auth (never UI login inside individual generated tests), and a specific quality-rules block (`e2e-quality-rules.md:8-24`) placed somewhere the agent reads automatically (CLAUDE.md, `.cursor/rules/`, or a dedicated test-dir file).
- `tsconfig.json`'s `include: ["**/*"]` and eslint's `parserOptions.projectService: true` mean every new `.ts` file under `tests/e2e/` is typechecked and linted the same way `src/**/*.ts` already is — including `npx astro check`. The project has no `@types/node` dependency today (an Astro/Cloudflare Workers app doesn't otherwise reference Node globals), so any file referencing `process.env` (Playwright's own config convention) needs that dependency added or `npx astro check`/lint will fail on the new files.

## Desired End State

Running `npx supabase start` (already running) then `npm run test:e2e` runs a Playwright suite that: provisions two fixed, reused test users once via a `setup` project; verifies every entry in the real `PROTECTED_ROUTES` array redirects an unauthenticated visitor to `/auth/signin` and loads normally for an authenticated one; and verifies a signed-in user can never read, mutate, or see another user's flashcard/review-schedule data through either the API or the rendered pages. `.claude/skills/10x-e2e`'s own readiness glob (`playwright.config.*` / `*.spec.ts`) succeeds, so a later `/10x-e2e` invocation can drive further rollout phases against this bootstrap directly.

**Verification**: `npx astro check && npm run build && npm run lint && npm run test:e2e` all pass; deliberately breaking each risk (removing a route from `PROTECTED_ROUTES`, weakening an RLS policy) makes the corresponding spec fail, proving the tests have real teeth rather than passing trivially.

### Key Discoveries:

- `save.ts` (`src/pages/api/flashcards/[id].ts`'s sibling) needs no AI call to create a real flashcard — the fastest, most direct way to seed cross-user test data.
- Supabase's local auth stack has `enable_confirmations = false`, making the real signup form usable end-to-end without any email step — exactly what "real cookies, real navigation" e2e testing needs, with no test-only backdoor.
- Since test users are fixed and reused across runs (not deleted), the second and later runs' signup attempts fail with an `?error=` redirect — this must be treated as "already exists" and handled by falling back to sign-in, not as a test failure.

## What We're NOT Doing

- Not fixing the `supabase/config.toml` port mismatch (3000 vs. actual 4321) — flagged in research as a real but unrelated bug; Playwright's `baseURL` targets port 4321 directly regardless, so it doesn't block anything here.
- Not wiring these specs into CI — that's rollout Phase 4 ("Quality-gates wiring") of `test-plan.md`, a separate change.
- Not covering risks #1, #4, #5, #6, #7 — those belong to rollout Phases 2 and 3 (unit and integration layers), separate changes.
- Not creating or deleting test users per-test — the two fixed accounts are provisioned once and reused indefinitely; cleanup is per-test only for the flashcard *data* rows those tests create, not for the accounts themselves.
- Not testing multiple browsers/devices — a single `chromium` project is enough to prove these two risks; a cross-browser matrix isn't justified by cost×signal at this stage.
- Not adding accessibility (axe-core) or visual-diff testing — out of scope for this phase and explicitly excluded from the whole rollout's negative space for visual testing (`test-plan.md` §7).
- Not touching `src/pages/api/flashcards/generate.ts`, the AI-generation flow, or any of the DB-trigger/rating-idempotency behavior — those are rollout Phase 2/3 territory.

## Implementation Approach

Four phases, infra-first: (1) Playwright bootstrap plus the shared two-user auth fixture, testable in isolation via the `setup` project alone; (2) the protected-route spec, which only needs one exported constant; (3) the cross-user isolation spec, the most involved one, reusing Phase 1's fixture; (4) the quality-rules file and final compatibility check, closing out the `.claude/skills/10x-e2e` handoff.

## Critical Implementation Details

**Fixed-credential idempotency on signup.** Since `enable_confirmations = false` makes a fresh signup immediately usable, but the two test accounts are *reused* across every local run (never deleted), the second and subsequent runs' signup attempt will fail with a redirect to `/auth/signup?error=<message>` (Supabase's "already registered" error) rather than succeeding. The setup logic must detect this via the resulting URL's `error` query param — not via HTTP status, since both success and failure paths return a 302 — and fall back to submitting the same credentials through `/auth/signin` instead:

```ts
async function ensureSignedIn(page: Page, email: string, password: string) {
  await page.goto("/auth/signup");
  // ...fill the real signup form fields (selectors per SignUpForm.tsx's
  // actual accessible names) and submit...
  if (new URL(page.url()).searchParams.has("error")) {
    // Signup's failure redirect still carries `?error=...`, never a
    // distinct status code — this account already exists from a prior
    // run. Fall back to signing in with the same fixed credentials.
    await page.goto("/auth/signin");
    // ...fill and submit the sign-in form with the same email/password...
  }
}
```

**`@types/node` is required, not optional.** This is otherwise a pure Astro/Cloudflare-Workers app with no existing Node-global usage in typechecked code. `playwright.config.ts`'s own convention (`process.env.CI`) and any test-side environment access will fail both `npx astro check` and lint (via `parserOptions.projectService: true` picking up the same `tsconfig.json` that includes `tests/e2e/**`) without it.

**Supabase must already be running.** Playwright's `webServer` config starts the Astro dev server automatically but does not — and should not — start the local Supabase stack. `npx supabase start` must already be running before `npm run test:e2e`; this is a manual precondition, not something the config automates.

## Phase 1: Playwright bootstrap + shared auth fixture

### Overview

Install Playwright, configure it against this project's real dev server and port, and provision the two fixed test users this whole rollout phase reuses, producing `storageState` files the later specs authenticate with.

### Changes Required:

#### 1. Dependencies

**File**: `package.json`

**Intent**: Add the e2e test runner and Node type definitions (see Critical Implementation Details), and give the suite a discoverable run command.

**Contract**: `devDependencies` gains `@playwright/test` (latest) and `@types/node` (latest matching the `.nvmrc`-pinned Node 22 line). `scripts` gains `"test:e2e": "playwright test"`.

#### 2. Playwright configuration

**File**: `playwright.config.ts` (new, repo root)

**Intent**: The central config `.claude/skills/10x-e2e` looks for by glob, pointed at this project's real dev server.

**Contract**: `testDir: "./tests/e2e"`; `use: { baseURL: "http://localhost:4321", trace: "on-first-retry" }`; `webServer: { command: "npm run dev", url: "http://localhost:4321", reuseExistingServer: !process.env.CI }`; two `projects`: `setup` (`testMatch: /global\.setup\.ts/`) and `chromium` (`use: { ...devices["Desktop Chrome"] }`, `dependencies: ["setup"]`).

#### 3. Shared auth fixture

**File**: `tests/e2e/global.setup.ts` (new)

**Intent**: Provision the two fixed accounts (`e2e-user-a@example.com` / `e2e-user-b@example.com`, one shared password meeting the 6-character minimum) via the real signup-or-signin flow, and persist each one's session as a `storageState` file for later specs to load directly (no UI login inside individual tests, per `.claude/skills/10x-e2e`'s own rule).

**Contract**: A Playwright test file matched by the `setup` project's `testMatch`. For each of the two accounts: run the `ensureSignedIn` flow from Critical Implementation Details, then `await page.context().storageState({ path: "playwright/.auth/user-a.json" })` (and `user-b.json` respectively).

#### 4. Ignore generated artifacts

**File**: `.gitignore`

**Intent**: Never commit live local session tokens or generated reports.

**Contract**: Append `/playwright/.auth/`, `/test-results/`, `/playwright-report/`, `/blob-report/`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Build passes: `npm run build`
- Linting passes: `npm run lint`
- Setup project runs cleanly: `npx playwright test --project=setup`

#### Manual Verification:

- With `npx supabase start` already running, `npx playwright test --project=setup` produces `playwright/.auth/user-a.json` and `user-b.json`, each containing a real session (non-empty `cookies`).
- Re-running the same command a second time (accounts now already exist) still succeeds via the sign-in fallback, not a failure.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Protected-route gating test (risk #3)

### Overview

Export the real `PROTECTED_ROUTES` array and drive a data-driven spec over it, so the test can never silently drift out of sync as routes are added.

### Changes Required:

#### 1. Export the protected-routes list

**File**: `src/middleware.ts`

**Intent**: Let the e2e spec import and iterate the real, current list instead of a hand-duplicated copy.

**Contract**: Change `const PROTECTED_ROUTES = [...]` to `export const PROTECTED_ROUTES = [...]`. No behavior change to the middleware itself.

#### 2. Protected-route spec

**File**: `tests/e2e/protected-routes.spec.ts` (new)

**Intent**: Prove risk #3 — every protected route redirects when signed out and loads normally when signed in; a public route never redirects.

**Contract**: Imports `PROTECTED_ROUTES` from `@/middleware`. For each entry: one test using an unauthenticated context (no `storageState`, or an explicit empty one) navigates to the route and asserts the final URL is `/auth/signin`; one test using `storageState: "playwright/.auth/user-a.json"` navigates to the same route and asserts the final URL still starts with that route (no redirect occurred). One additional negative-control test navigates to `/` unauthenticated and asserts no redirect occurs.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Build passes: `npm run build`
- Linting passes: `npm run lint`
- `npm run test:e2e -- tests/e2e/protected-routes.spec.ts` passes

#### Manual Verification:

- Temporarily remove one entry from `PROTECTED_ROUTES`, re-run the spec, and confirm it fails for that route (proves the test has real teeth) — then restore the entry.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Cross-user isolation test (risk #2)

### Overview

Prove that a signed-in user can never read, mutate, or see another user's flashcard/review-schedule data — across both the by-id API mutation routes and the SSR listing pages — as regression coverage for an already-verified-correct RLS control.

### Changes Required:

#### 1. Cross-user isolation spec

**File**: `tests/e2e/cross-user-isolation.spec.ts` (new)

**Intent**: Lock in today's correct cross-user isolation behavior so a future regression (a new route forgetting RLS reliance, or an accidental service-role client) gets caught immediately.

**Contract**: Authenticated as user A (`storageState: "playwright/.auth/user-a.json"`), `request.post("/api/flashcards/save", { data: { cards: [{ front: <unique Date.now()-suffixed text>, back: "...", source: "ai_generated" }] } })` to seed one flashcard; capture its id from the response (or a subsequent `/flashcards` read). Then, in a context authenticated as user B (`storageState: "playwright/.auth/user-b.json"`):
- `request.patch("/api/flashcards/<id>", ...)` → assert `404`
- `request.delete("/api/flashcards/<id>")` → assert `404`
- `request.post("/api/study/<id>", { data: { rating: "remembered" } })` → assert `404`
- `page.goto("/flashcards")` → assert the unique front text is not present
- `page.goto("/study")` → assert the unique front text is not present

Then, back as user A: `page.goto("/flashcards")` → assert the unique front text **is** present (positive control, proving the isolation assertions above aren't vacuously true). Finally, as user A, `request.delete("/api/flashcards/<id>")` to clean up the seeded row (per `.claude/skills/10x-e2e`'s cleanup-per-test rule — the flashcard *data* is cleaned up even though the *accounts* persist).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Build passes: `npm run build`
- Linting passes: `npm run lint`
- `npm run test:e2e -- tests/e2e/cross-user-isolation.spec.ts` passes

#### Manual Verification:

- Temporarily comment out the `flashcards_select_own` RLS policy's `using` clause locally (or otherwise weaken one policy), re-run the spec, and confirm the isolation assertion fails (proves the test has real teeth) — then restore it (e.g. `npx supabase db reset` or re-applying the migration).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: E2E quality-rules file + final compatibility check

### Overview

Close out `.claude/skills/10x-e2e`'s expected handoff: give it the rules block it looks for, refresh the stale "no test runner" documentation, and confirm the skill's own readiness detection would now succeed.

### Changes Required:

#### 1. E2E testing rules

**File**: `AGENTS.md`

**Intent**: Give a future `/10x-e2e` invocation (and any human) the exact rules block the skill expects to find already in place, and correct the now-stale "no test runner" line.

**Contract**: Replace the "No test runner is configured yet — don't assume `npm test` exists" line under "Build, Test, and Development Commands" with an accurate one naming `npm run test:e2e`. Append a new `## E2E Testing Rules` section containing the rules block from `.claude/skills/10x-e2e/references/e2e-quality-rules.md` (lines 8-24) verbatim.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Build passes: `npm run build`
- Linting passes: `npm run lint`
- Full suite passes: `npm run test:e2e`

#### Manual Verification:

- Confirm `.claude/skills/10x-e2e`'s own readiness glob (`playwright.config.*` or `*.spec.ts`) would now find real files: `ls playwright.config.ts tests/e2e/*.spec.ts`.
- Confirm `AGENTS.md`'s test-command documentation reads correctly end-to-end.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Unit Tests:

- None — this phase is e2e-only by design (unit coverage is rollout Phase 2 of `test-plan.md`, a separate change).

### Integration Tests:

- None automated beyond the e2e specs above (DB-trigger/integration coverage is rollout Phase 3 of `test-plan.md`, a separate change).

### Manual Testing Steps:

1. Run through each phase's manual criteria above, including the deliberate-breakage checks (remove a protected route, weaken an RLS policy) to confirm both specs have real teeth, not just passing trivially.
2. Run `npm run test:e2e` twice in a row without any cleanup between runs, confirming the fixed-account fallback logic makes both runs succeed identically.
3. Run `npx astro check && npm run build && npm run lint && npm run test:e2e` end-to-end to confirm everything compiles, lints, and passes together.

## Performance Considerations

Two lightweight specs against a local dev server and local Supabase instance — no performance-sensitive paths introduced. The `setup` project's one-time signup/signin adds a few seconds to the first run only; later runs reuse the same accounts via the sign-in fallback.

## Migration Notes

No database migration in this plan — the existing `flashcards`/`review_schedules` schema and RLS policies (F-01, unchanged) are exactly what's under test.

## References

- Research: `context/changes/testing-critical-path-access-control/research.md`
- Test plan: `context/foundation/test-plan.md` (rollout Phase 1, risks #2 and #3)
- `.claude/skills/10x-e2e/SKILL.md`, `.claude/skills/10x-e2e/references/e2e-quality-rules.md`, `.claude/skills/10x-e2e/references/seed-test-pattern.md` — conventions this bootstrap targets
- RLS policies: `supabase/migrations/20260907195424_flashcard_data_foundation.sql:36-55,102-121`
- Protected routes: `src/middleware.ts:4,18-21`
- Flashcard seeding: `src/pages/api/flashcards/save.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Playwright bootstrap + shared auth fixture

#### Automated

- [x] 1.1 Type checking passes: `npx astro check` — c02548e
- [x] 1.2 Build passes: `npm run build` — c02548e
- [x] 1.3 Linting passes: `npm run lint` — c02548e
- [x] 1.4 Setup project runs cleanly: `npx playwright test --project=setup` — c02548e

#### Manual

- [x] 1.5 Both storageState files are produced with real, non-empty sessions — c02548e
- [x] 1.6 Re-running setup a second time succeeds via the sign-in fallback — c02548e

### Phase 2: Protected-route gating test (risk #3)

#### Automated

- [x] 2.1 Type checking passes: `npx astro check` — d2cec00
- [x] 2.2 Build passes: `npm run build` — d2cec00
- [x] 2.3 Linting passes: `npm run lint` — d2cec00
- [x] 2.4 `npm run test:e2e -- tests/e2e/protected-routes.spec.ts` passes — d2cec00

#### Manual

- [x] 2.5 Removing a route from `PROTECTED_ROUTES` makes the spec fail for that route — d2cec00

### Phase 3: Cross-user isolation test (risk #2)

#### Automated

- [x] 3.1 Type checking passes: `npx astro check`
- [x] 3.2 Build passes: `npm run build`
- [x] 3.3 Linting passes: `npm run lint`
- [x] 3.4 `npm run test:e2e -- tests/e2e/cross-user-isolation.spec.ts` passes

#### Manual

- [x] 3.5 Weakening an RLS policy makes the isolation assertion fail

### Phase 4: E2E quality-rules file + final compatibility check

#### Automated

- [ ] 4.1 Type checking passes: `npx astro check`
- [ ] 4.2 Build passes: `npm run build`
- [ ] 4.3 Linting passes: `npm run lint`
- [ ] 4.4 Full suite passes: `npm run test:e2e`

#### Manual

- [ ] 4.5 `.claude/skills/10x-e2e`'s readiness glob finds real files
- [ ] 4.6 `AGENTS.md`'s test-command documentation reads correctly
