---
date: 2026-09-13T23:00:27+02:00
researcher: Claude Sonnet 5
git_commit: 4bde290634780a7bc18667d45e966ffe9f73a6d1
branch: main
repository: 10x-cards
topic: "Bootstrap Playwright and prove cross-user access control end-to-end (test-plan rollout Phase 1, risks #2 and #3)"
tags: [research, codebase, e2e, playwright, rls, middleware, auth, protected-routes]
status: complete
last_updated: 2026-09-13
last_updated_by: Claude Sonnet 5
---

# Research: Bootstrap Playwright and prove cross-user access control end-to-end

**Date**: 2026-09-13T23:00:27+02:00
**Researcher**: Claude Sonnet 5
**Git Commit**: 4bde290634780a7bc18667d45e966ffe9f73a6d1
**Branch**: main
**Repository**: 10x-cards

## Research Question

Ground rollout Phase 1 of `context/foundation/test-plan.md`: bootstrap Playwright into a repo with zero existing tests, and prove (a) cross-user isolation on flashcard/review-schedule endpoints (risk #2) and (b) protected-route/session gating (risk #3) end-to-end, in a way compatible with this repo's existing `.claude/skills/10x-e2e` skill for future rollout phases.

## Summary

**Risk #3 (protected-route/session gating) is confirmed as framed** — `PROTECTED_ROUTES` in `src/middleware.ts` is a flat, prefix-matched array with no return-to param, and it's genuinely plausible for a new page to ship without joining it (this project has already grown the array three times, once per slice).

**Risk #2 (cross-user IDOR) needs its framing corrected before planning.** The hypothesis in `test-plan.md` — "routes rely on RLS alone with no explicit ownership check in app code," implying a gap — is factually true as a *mechanism* but wrong as a *risk*: every CRUD operation on both `flashcards` and `review_schedules` has an explicit, correctly-scoped RLS policy (8/8, all keyed on `auth.uid() = user_id`); there is zero service-role key usage anywhere in the codebase; every Supabase client is the request-scoped anon-key client bound to the caller's session; and this exact control has already been manually verified and code-reviewed **three times** across the F-01, S-03, and S-04 archived changes, each time confirmed correct (non-owned rows return 404, not a leak). This is not an open vulnerability — it's a **regression-coverage gap**: a correct, already-verified control has no automated test protecting it from a future accidental regression (e.g., someone adding a new route that forgets RLS reliance, or switching a client to service-role). The e2e test is still exactly the right response; the risk wording should change from "may leak" to "protect this already-correct behavior from silently regressing."

The repo has **zero test infrastructure of any kind** (confirmed: no `@playwright/test`, no test script, no `*.spec.ts`, no `playwright.config.*`, no `supabase/seed.sql`, no fixtures/scripts directory) — Playwright must be bootstrapped from scratch. `.claude/skills/10x-e2e` detects "Playwright ready" via a single glob (`playwright.config.*` or `*.spec.ts`) and expects (not enforces) a `tests/e2e/<feature>.spec.ts` convention, a `storageState`-based auth setup, and an e2e rules file — all satisfiable by this phase's bootstrap.

Two concrete environment bugs were surfaced that the plan should address or at least flag: (1) `supabase/config.toml`'s `site_url`/`additional_redirect_urls` reference port `3000`, but the actual `astro dev` server defaults to port `4321` (no `server.port` override anywhere) — a real, currently-live mismatch, not a test artifact; (2) `README.md:114` states "No database tables or migrations are required" — stale since F-01/S-03 shipped real migrations.

## Detailed Findings

### Middleware and protected routes (risk #3)

- `src/middleware.ts:4` — `const PROTECTED_ROUTES = ["/dashboard", "/generate", "/flashcards", "/study"];`
- `src/middleware.ts:18-21` — gating is `context.url.pathname.startsWith(route)` (prefix match, not exact) for each route; on no `context.locals.user`, `return context.redirect("/auth/signin")`.
- No `?redirect=`/return-to param — after login, `src/pages/api/auth/signin.ts:19` always redirects to `/`, never back to the originally-requested protected page. An e2e test should assert this exact behavior (deep-link while logged out → `/auth/signin` → post-login lands on `/`, not back on the original page) rather than assuming a return-to exists.
- `context.locals.user` is set via `supabase.auth.getUser()` (`src/middleware.ts:10`) on **every** request, including public pages — `getUser()` validates the JWT against the Auth server (not just trusting the cookie).
- If Supabase env vars are absent, `createClient` returns `null` and every request is treated as logged out (`src/middleware.ts:14-15`) — protected routes always redirect to signin when unconfigured.
- Pages: `/` (public), `/auth/signin`, `/auth/signup`, `/auth/confirm-email` (all public, none of them redirect an already-authenticated user away — visiting `/auth/signin` while logged in just re-shows the form), `/dashboard`, `/generate`, `/flashcards`, `/study` (all protected).
- API routes gate independently and differently: `flashcards/save.ts:34`, `flashcards/[id].ts:13,70`, `study/[id].ts:46` each check `context.locals.user` and return **`401 {"error":"..."}` JSON** (not a redirect) when absent — a distinct, separately-testable behavior from the page-level middleware redirect.

### RLS and ownership enforcement (risk #2 — framing correction)

- `supabase/migrations/20260907195424_flashcard_data_foundation.sql:36-55` (flashcards) and `:102-121` (review_schedules) — 8/8 explicit RLS policies, one per CRUD operation per table, every one keyed on `auth.uid() = user_id`. No unprotected operation, no default-allow fallthrough.
- Every API route that touches these tables (`flashcards/save.ts:38`, `flashcards/[id].ts:17,74`, `study/[id].ts:50`, plus `flashcards.astro:6` and `study.astro:6`) calls `createClient(context.request.headers, context.cookies)` — the identical request-scoped, anon-key client every time. `grep -rn "SUPABASE_SERVICE\|service_role"` across `src/` and `supabase/`: **zero matches**, confirmed twice (by two independent sub-agents).
- By-id reads/updates/deletes (`flashcards/[id].ts`, `study/[id].ts`) intentionally omit an explicit `user_id` filter and rely purely on RLS — this is a **documented, reviewed design choice**, not an oversight: `src/pages/api/flashcards/[id].ts:48-50,87-89` and `src/pages/api/study/[id].ts:76-78` all carry comments acknowledging it, and `context/archive/2026-09-13-manage-saved-flashcards/plan.md:46` explicitly states the resulting behavior is correct ("a non-owner gets the same 404 as a nonexistent id... the correct behavior, not an oversight").
- Prior verification trail: `context/archive/2026-09-07-flashcard-data-foundation/plan.md:19,72,118` (manual two-user RLS check, policy-count check, both done with commit hashes); its `reviews/impl-review.md:62` ("both tables have RLS enabled with all 4 CRUD policies correctly keyed"); `context/archive/2026-09-13-manage-saved-flashcards/reviews/impl-review.md:39` ("RLS is relied on correctly in both routes... no manual user_id filtering needed"); `context/archive/2026-09-13-spaced-repetition-study-session/reviews/impl-review.md:47` ("Auth/RLS confirmed genuinely enforced").
- **Conclusion for planning**: write the e2e test as regression coverage for a correct, already-reviewed control (cross-user `PATCH`/`DELETE /api/flashcards/[id]`, `POST /api/study/[id]` → 404 for a non-owned id; no cross-user rows in `flashcards.astro`/`study.astro` listings) — not as if hunting an open vulnerability.

### Auth flow, test-user seeding, and environment

- `src/pages/api/auth/signup.ts` (21 lines) and `signin.ts` (21 lines) both read `context.request.formData()` (not JSON), call `supabase.auth.signUp`/`signInWithPassword`, and respond with a **302 redirect** — success: `/auth/confirm-email` (signup) or `/` (signin); failure: back to the form with `?error=<message>`. `signout.ts` (11 lines) calls `signOut()` then redirects to `/`.
- `supabase/config.toml:221` — **`enable_confirmations = false`** for the local stack: a `signUp` call is immediately usable, no email-confirmation step needed for programmatic test-user creation.
- `supabase/config.toml:202` — `sign_in_sign_ups = 30` per 5 minutes per IP rate limit; plenty of headroom for a two-user e2e fixture, worth knowing if the suite grows.
- `supabase/config.toml:154,158` — `site_url = "http://127.0.0.1:3000"`, `additional_redirect_urls = ["https://127.0.0.1:3000"]` — **mismatched** with the actual dev server port (see below); also `https` where `http` was surely intended. Pre-existing bug, unrelated to but discovered by this research.
- Session cookie: no custom name configured anywhere (`grep "sb-"` across `src/`: zero hits) — the library default applies, `sb-127-auth-token` for `SUPABASE_URL=http://127.0.0.1:54321` (chunked into `.0`, `.1`, … if large). Attributes: `path: "/"`, `sameSite: "lax"`, `httpOnly: false`, cookie `maxAge` 400 days (browser-side cap; unrelated to actual token validity). Real session lifetime: JWT `jwt_expiry = 3600`s, refresh token rotates (`enable_refresh_token_rotation = true`, 10s reuse grace).
- `package.json` — no `test`/`e2e` script, no `@playwright/test` dependency, `"dev": "astro dev"` is the only local-server script. `.nvmrc` pins Node `22.14.0`.
- `astro.config.mjs` — no `server.port` override → Astro's default **port 4321** (not 3000, confirming the config.toml mismatch above). `SUPABASE_URL`/`SUPABASE_KEY` declared `optional: true, access: "secret"` — if unset, every auth-dependent flow silently no-ops via `createClient` returning `null`, so a Playwright run needs both `.env` (Node/`astro:env`) and `.dev.vars` (Cloudflare adapter's dev runtime) populated per `README.md:81-114`.
- `wrangler.jsonc` has no `[dev]` port and isn't part of the normal local loop — `npm run dev` (`astro dev`) is the only dev server this project actually runs locally.
- No `supabase/seed.sql` exists on disk despite being referenced in `config.toml:60-65` — nothing to reuse; a seed mechanism (or inline signup-per-test) starts from scratch. No `scripts/`, `fixtures/`, or `e2e*` directory exists anywhere in the repo today.

### `.claude/skills/10x-e2e` compatibility requirements

- **Readiness detection** (`SKILL.md:112-122`): a single glob for `playwright.config.*` **or** `*.spec.ts` — if neither exists, it hard-stops with a message pointing at `npm init playwright@latest`. Either artifact alone satisfies detection; having both is best.
- **Expected layout** (`SKILL.md:251,387`): `playwright.config.ts` at repo root (implied — Playwright's own default and where the glob looks); generated feature specs default to `tests/e2e/<feature>.spec.ts`, one test per file. The exemplar/"seed" spec is referenced elsewhere at `tests/seed.spec.ts` (`browser-driven-generation.md:101`).
- **Auth pattern**: `storageState`-based, never UI login inside individual generated tests (`e2e-quality-rules.md:22-23`; `SKILL.md:61` lists this as an assumed-present pattern the skill *discovers*, not one it builds) — this phase should produce a working Playwright `setup` project (or equivalent) that logs in once and reuses `storageState`.
- **Quality rules** (`e2e-quality-rules.md:8-24`, verbatim block meant to be copied into a project rules file): `getByRole`/`getByLabel`/`getByText` as primary locators (no CSS/XPath), no shared state between tests, no `page.waitForTimeout()` (use `toBeVisible()`/`waitForURL()`/`waitForResponse()`), assert business outcomes not implementation details, unique test-data identifiers + cleanup in `afterEach`.
- **Anti-patterns** (`e2e-anti-patterns.md`): hallucinated assertions, brittle selectors, shared state, timeout-based waits, no cleanup — each with a documented fix.
- **No specific `package.json` script name is required** by the skill — it discovers whatever single-spec invocation exists.
- The skill can drive generation via Playwright CLI (preferred, cheaper) or the `mcp__playwright__*` MCP tools (fallback) — neither dictates project structure beyond what's above; it does mean UI elements should carry real accessible roles/labels (semantic HTML/ARIA) since generation works off the accessibility tree.

## Code References

- `src/middleware.ts:4,18-21` — `PROTECTED_ROUTES` array and redirect logic
- `src/pages/api/auth/signin.ts:19` — post-login redirect target (`/`, no return-to)
- `src/pages/api/flashcards/save.ts:34`, `src/pages/api/flashcards/[id].ts:13,48-50,70,87-89`, `src/pages/api/study/[id].ts:46,76-78` — 401 gating + documented RLS-only reliance
- `supabase/migrations/20260907195424_flashcard_data_foundation.sql:36-55,102-121` — all 8 RLS policies
- `src/lib/supabase.ts:1-27` — the single client-construction path, anon key only
- `supabase/config.toml:154,158,171,177,202,221` — auth config relevant to test-user seeding and the port mismatch
- `astro.config.mjs` (full file) — no `server.port` override (→ port 4321 default), `astro:env` secret schema
- `package.json` (full file) — no test runner, no `@playwright/test`, no test script
- `.claude/skills/10x-e2e/SKILL.md:61,112-122,251,387` — readiness detection and layout expectations
- `.claude/skills/10x-e2e/references/e2e-quality-rules.md:8-24` — the rules block to seed
- `.claude/skills/10x-e2e/references/seed-test-pattern.md` — exemplar seed-spec conventions

## Architecture Insights

- This codebase has a strict, repeated convention: every Supabase-touching route/page calls `createClient(context.request.headers, context.cookies)` (or the `.astro` equivalent with `Astro.request.headers`/`Astro.cookies`) identically — no exceptions found across 8 call sites. This uniformity is exactly what makes the RLS-only ownership model safe and auditable, and it's also what an e2e/regression test should lock in place (a future route that deviates from this pattern is the actual way risk #2 could someday become real).
- `PROTECTED_ROUTES` is a single flat array with no per-route metadata (no redirect target override, no role requirement) — simple by design, but that simplicity is exactly why it's easy to forget to extend (this project has extended it three times, once per feature slice, and nothing currently guards against forgetting a fourth time).
- API routes and page routes fail differently on auth (401 JSON vs. 302 redirect) — an e2e suite needs both assertion shapes, not just one.

## Historical Context (from prior changes)

- `context/archive/2026-09-07-flashcard-data-foundation/plan.md` — original RLS design and its manual two-user verification step (never automated).
- `context/archive/2026-09-13-manage-saved-flashcards/plan.md:46` and its `reviews/impl-review.md:39` — the explicit "non-owner gets 404, this is correct, not an oversight" reasoning this plan should preserve.
- `context/archive/2026-09-13-spaced-repetition-study-session/reviews/impl-review.md:47` — most recent independent re-confirmation of the same RLS control, one slice ago.
- `context/foundation/test-plan.md` §2 — the risk map this research grounds; risk #2's wording needs a backport correction per the Summary above (test-plan orchestrator's own "post-research backport check" step).

## Related Research

- None yet — this is the first research document for this change and the first rollout phase of `context/foundation/test-plan.md`.

## Open Questions

- Should the Playwright bootstrap fix the `supabase/config.toml` port mismatch (3000 → 4321, `https` → `http`) as part of this phase, or leave it as a separately-flagged pre-existing bug? It doesn't block e2e tests (Playwright's `baseURL` can simply target 4321 directly regardless of what `config.toml` says), but it could bite a real user relying on auth redirect URLs.
- Should the seed/fixture mechanism create test users via direct `supabase.auth.admin.createUser()` calls (fast, no HTTP round-trip, needs a service-role key available only to the test runner — never the app) or via the real `/api/auth/signup` form flow (slower, but exercises zero test-only code paths)? Both are viable; this is a planning-time decision, not a research gap.
