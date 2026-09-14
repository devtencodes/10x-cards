---
change_id: testing-critical-path-access-control
title: Bootstrap Playwright and prove cross-user access control end-to-end
status: implemented
created: 2026-09-13
updated: 2026-09-14
archived_at: null
---

## Notes

Rollout Phase 1 of `context/foundation/test-plan.md` (§3). Bootstraps Playwright — this project has zero tests of any kind today — and delivers its first user-perspective (e2e) test.

Risks covered (test-plan.md §2):
- **#2** — a signed-in user reads, edits, deletes, or rates another user's flashcard/review-schedule row (authorization/IDOR). Routes rely on RLS alone with no explicit ownership check in app code.
- **#3** — a protected page/route ships without joining `PROTECTED_ROUTES`, or a session-handling change breaks redirect/persistence.

Test type planned: e2e (Playwright — not yet installed in this repo).

Risk response intent (test-plan.md §2 Risk Response Guidance):
- **#2**: prove user B cannot read/edit/delete/rate user A's flashcard or review-schedule via any route or page, even passing A's real id. Must challenge "an RLS policy existing = ownership enforced correctly" — verify every API route's Supabase client is request-scoped (never service-role), and per-operation RLS policies exist on `flashcards` and `review_schedules`. Cheapest layer: e2e against two seeded users on real local Supabase (RLS is only truly exercised against real Postgres — a mocked client tests the mock, not the policy).
- **#3**: prove an authenticated session reaches every route in `PROTECTED_ROUTES` and an unauthenticated request is redirected to `/auth/signin` from every one of them. Must challenge "redirect works for one route implies it works for all" — `PROTECTED_ROUTES` is a flat array a new page can ship without joining. Cheapest layer: e2e (real cookies, real navigation) — unit-testing the middleware function with a mocked context would miss a route simply missing from the array.

After this change ships, update `context/foundation/test-plan.md` §3 Status for this row and continue the rollout per the orchestrator.
