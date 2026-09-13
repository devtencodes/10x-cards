# Bootstrap Playwright and Prove Cross-User Access Control — Plan Brief

> Full plan: `context/changes/testing-critical-path-access-control/plan.md`
> Research: `context/changes/testing-critical-path-access-control/research.md`

## What & Why

This repo has zero tests today. This plan bootstraps Playwright from scratch and delivers two e2e specs proving `test-plan.md` rollout Phase 1's two risks — cross-user data isolation (#2) and protected-route/session gating (#3) — while also satisfying the "at least one test verifying behavior from the user's perspective" certification requirement that motivated the whole rollout.

## Starting Point

No test runner, no config, no spec files, no seed mechanism exist anywhere in the repo (confirmed via direct inspection). `src/middleware.ts` gates four routes via a non-exported `PROTECTED_ROUTES` array. RLS on `flashcards`/`review_schedules` is already fully correct (8/8 policies, zero service-role usage) and has been manually reviewed three times across prior slices — research corrected the risk map to frame this as regression coverage, not an open vulnerability.

## Desired End State

`npm run test:e2e` (with local Supabase already running) provisions two reused test users once, then verifies every protected route redirects when signed out and loads when signed in, and that a signed-in user can never read, mutate, or see another user's flashcard/review-schedule data via any route or page. `.claude/skills/10x-e2e`'s own readiness check (`playwright.config.*` / `*.spec.ts`) succeeds, so a later `/10x-e2e` invocation can drive further phases directly.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Test-user creation | Real signup/signin flow, no admin API | Zero test-only code paths, no new service-role secret, matches real e2e navigation | Plan |
| Port mismatch (config.toml vs. actual 4321) | Leave it, flag as follow-up | Doesn't block any test; keeps this phase tightly scoped | Plan |
| Risk #2 coverage depth | Include SSR listing pages, not just by-id API routes | `test-plan.md`'s own Response Guidance says "via any route or page" | Plan |
| Protected-route test design | Export `PROTECTED_ROUTES`, data-driven test | Auto-stays correct forever — exactly what risk #3 worries about | Plan |
| Spec file structure | Two separate files, one per risk | Matches `.claude/skills/10x-e2e`'s stated "one test per file" convention | Plan |
| Test-user lifecycle | Global setup, reuse across runs, no auto-delete | Fast, matches Playwright's standard pattern; no self-delete API without a service-role key | Plan |

## Scope

**In scope:** Playwright bootstrap (config, deps, `.gitignore`), a `setup` project provisioning two fixed test users, `PROTECTED_ROUTES` export, two e2e specs (protected-routes, cross-user-isolation), the `.claude/skills/10x-e2e` quality-rules handoff in `AGENTS.md`.

**Out of scope:** CI wiring (rollout Phase 4), risks #1/#4/#5/#6/#7 (rollout Phases 2/3, unit + integration), the `config.toml` port-mismatch bug fix, per-test user creation/deletion, multi-browser/accessibility/visual testing.

## Architecture / Approach

A Playwright `setup` project runs once, signs up (or falls back to signing in) two fixed accounts through the real `/auth/signup`/`/auth/signin` forms, and saves two `storageState` files. Two independent spec files load those storageStates directly (no UI login per test) and drive the real dev server (`astro dev` on port 4321) against the already-running local Supabase stack — nothing is mocked.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Playwright bootstrap + auth fixture | Config, deps, two reusable authenticated sessions | Fixed-account idempotency (signup-vs-signin fallback) is non-obvious |
| 2. Protected-route gating test | Data-driven spec over the real `PROTECTED_ROUTES` array | Requires a small production-code export |
| 3. Cross-user isolation test | Spec covering both API mutation routes and SSR pages | Needs a real seeded flashcard + careful cleanup |
| 4. Quality-rules handoff | `AGENTS.md` rules block + final compatibility check | Low risk — documentation and verification only |

**Prerequisites:** Local Supabase running (`npx supabase start`); no other dependencies.
**Estimated effort:** ~1-2 sessions across 4 phases.

## Open Risks & Assumptions

- `@types/node` must be added or `npx astro check`/lint will fail on the new Playwright config/test files referencing `process.env` — called out as a Critical Implementation Detail in the full plan.
- Exact form-field selectors (`getByLabel`/`getByRole` names) for `SignInForm.tsx`/`SignUpForm.tsx` weren't verified in research — the implementer confirms these against the real components during Phase 1.
- The `supabase/config.toml` port mismatch (3000 vs. actual 4321) stays unfixed per the accepted decision above — noted here so it isn't mistaken for an oversight later.

## Success Criteria (Summary)

- `npx astro check && npm run build && npm run lint && npm run test:e2e` all pass.
- Deliberately breaking each risk (removing a protected route, weakening an RLS policy) makes the corresponding spec fail — proving real protection, not vacuous tests.
- `.claude/skills/10x-e2e` can now be invoked for future rollout phases without hitting its "Playwright not installed" stop condition.
