# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-09-13

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the team
   is worried about X, and the failure would surface somewhere in area Y"
   carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/` (30d window, 16 commits).

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives."

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|---|---|---|---|
| 1 | AI-generation endpoint mishandles unpredictable/malformed model output (bad JSON, empty result, provider error), breaking the PRD's "never a silent no-op" guardrail | High | High | interview Q3; PRD guardrail (prd.md NFR "never a silent no-op"); archive/ai-generated-flashcards/plan.md:48 (documented: identical requests produced malformed JSON in one run, a hard 30s timeout in another) |
| 2 | A future code change (new route, or a refactor of an existing one) breaks RLS reliance or the request-scoped-client pattern, letting a signed-in user read/edit/delete/rate another user's flashcard/review-schedule row — the current implementation is correct and has been manually verified three times across prior slices, but has zero automated regression coverage | High | Medium | interview Q1 (top-stated worry); PRD Access Control + NFR ("never exposed to any user other than their owner"); hot-spot dir `src/pages/api/flashcards/` (6 commits/30d), `src/lib/` (8 commits/30d); research.md (confirmed 8/8 RLS policies correct, zero service-role usage — this is regression coverage for a verified-correct control, corrected from an earlier "open gap" framing) |
| 3 | A protected page/route ships without being added to `PROTECTED_ROUTES`, or a session-handling change breaks redirect/persistence, letting an unauthenticated request through or logging a user out mid-study | High | Medium | PRD FR-002 acceptance criterion (session persists, no aggressive timeout); hot-spot `src/middleware.ts` (4 commits/30d — single most-changed file, touched by every new protected page) |
| 4 | Editing a flashcard's content fails to reset its review schedule to "new" (a DB trigger gated by a WHEN clause silently stops firing after a future migration touches it) | Medium | Medium | PRD FR-008; archive/manage-saved-flashcards/plan.md (`reset_review_schedule_on_flashcard_edit` trigger) |
| 5 | A provider-side rate-limit/quota error from the shared free-tier model is not surfaced as a clear failure message, contradicting the "never silent" guardrail | Medium | Medium | PRD guardrail (never silent no-op); archive/ai-generated-flashcards/reviews/impl-review-phase-1.md F1 (quota-exhaustion previously accepted as risk, not yet tested) |
| 6 | Server-side validation of pasted source-text length (100–10,000 chars) is bypassed or regresses, letting a direct API call reach the AI provider ungated | Medium | Medium | PRD US-01 acceptance criteria (explicit length-bound + validation-message requirement) |
| 7 | A retried rating request (after a lost response) double-applies a state transition, compounding a card's interval twice | Medium | Low | archive/spaced-repetition-study-session/reviews/impl-review.md (accepted-risk observation, F2); PRD FR-011 |

**Abuse/security lens applied:** #2 covers authorization/IDOR; #5/#6 cover resource-abuse and untrusted-input classes. Secret/PII leakage was considered (error logs, front-end bundle) but no concrete evidence surfaced a real gap — not promoted to a top-7 row; revisit at `--refresh` if research surfaces one.

**Challenger findings:** a candidate risk "no rate limiting on the AI-generation endpoint" was dropped as originally framed — breaking it would require *adding* a rate limiter that doesn't exist yet (speculative). Reframed as #5 above: testing the *existing* error-surfacing behavior when the provider itself returns a rate-limit error, which is a real code path today.

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|---|---|---|---|---|
| #1 | Malformed/non-JSON output, an empty valid-candidate result, and a hard provider error each produce the PRD-mandated distinct outcomes (empty-array 200 vs. explicit failure message) — never a silent hang or unhandled exception | "The happy-path JSON response is representative" — it isn't; two distinct malformed shapes were already observed from real models | The parsing/validation function's bracket-depth JSON extraction and its success/failure branching | unit (fixture-driven, no live model call) | A test that only feeds well-formed JSON and calls generation "tested" |
| #2 | User B cannot read, edit, delete, or rate user A's flashcard/review-schedule via any route or page, even passing A's real id (confirmed correct today per research.md — this test locks it in place against a future regression) | "An RLS policy existing = ownership enforced correctly" — a policy can be present but subtly misscoped, or a route could accidentally use a service-role client | Every API route's Supabase client is request-scoped (never service-role); per-operation RLS policies exist on `flashcards` and `review_schedules` | e2e (two seeded users against real local Supabase — RLS is only truly exercised against real Postgres) | Asserting against a mocked Supabase client — tests the mock, not the policy |
| #3 | An authenticated session reaches every route in `PROTECTED_ROUTES`; an unauthenticated request is redirected to `/auth/signin` from every one of them; a session survives a full interaction without dropping | "Redirect works for one route implies it works for all" — `PROTECTED_ROUTES` is a flat array a new page can ship without joining | Current contents of `PROTECTED_ROUTES`; how session cookies are set/read across Workers Secrets | e2e (real cookies, real navigation) | Unit-testing the middleware function with a mocked context — misses a route simply missing from the array |
| #4 | Editing a flashcard's front/back resets `state`/`due_at`/`interval_days` to the "new" baseline; editing only unrelated fields or re-saving identical content does not | "The trigger fires on any UPDATE" — it's WHEN-gated on front/back changing specifically | Current trigger definition and the edit route that triggers it | integration (real local Supabase — behavior lives in a DB trigger, a mock tests nothing) | Testing only the PATCH handler's HTTP response shape without checking the resulting DB row |
| #5 | When the provider returns a rate-limit/quota error, the route surfaces the PRD-mandated clear failure message — not a generic 500, not a silent empty result | "The existing malformed-JSON failure path (#1) already covers this" — an HTTP-level provider error is a different failure shape and may not route through the same message logic | How the route currently distinguishes a non-2xx provider response from a malformed-but-200 body | unit (mock a 429 from the provider fetch) | Testing only the malformed-JSON case and assuming an HTTP error is handled the same way |
| #6 | Text outside 100–10,000 chars is rejected server-side with a clear message before any AI call, even bypassing the UI entirely | "The client-side character counter is enough" — PRD frames this as a request-level guarantee | The generation route's validation order (before or after the AI call is dispatched) | unit/integration (hit the route directly with boundary/out-of-bounds payloads) | Testing only via the UI form, which already enforces the bound client-side |
| #7 | Submitting the same rating twice in immediate succession for the same card does not compound the interval/state transition twice | "The client only ever sends one request per rating" — already documented as not guaranteed under network failure | The rating route's read-then-compute-then-write logic; whether an idempotency key is feasible | integration (hit the route twice in succession) | Treating this as covered because the state-transition table itself is unit tested — correctness and retry-idempotency are different properties |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Critical-path access control | Bootstrap Playwright; prove cross-user isolation and protected-route gating end-to-end | #2, #3 | e2e | change opened | `context/changes/testing-critical-path-access-control/` |
| 2 | AI-generation safety net | Bootstrap a unit-test runner; lock down parsing, provider-error surfacing, and input-length validation | #1, #5, #6 | unit | not started | — |
| 3 | Business-rule integration coverage | Prove the edit-resets-schedule trigger and rating-retry idempotency against a real DB | #4, #7 | integration | not started | — |
| 4 | Quality-gates wiring | Wire unit + e2e suites into CI so all layers run on every PR | — (locks the floor) | gates | not started | — |

**Order rationale:** Risk #1 (AI parsing) ranks highest by impact×likelihood but is cheaply unit-testable — it doesn't need to go first to justify the rollout. Phase 1 instead tackles #2/#3 because (a) #2 is the team's own top-stated worry (interview Q1) and a PRD guardrail, and (b) both #2 and #3 can *only* be verified at the e2e/integration layer — RLS enforcement and redirect/session behavior are unobservable from a unit test. Bootstrapping Playwright first also delivers this project's first user-perspective test immediately. Phase 2 is independent of Phase 1's browser infra (fixture-driven, no live model, no browser) and could ship in parallel. Phase 3 reuses Phase 1's seeded-user pattern against real Supabase for DB-level behavior a mock would falsify. Phase 4 has nothing to gate until Phases 1–3 exist.

## 4. Stack

| Layer | Tool | Version | Notes |
|---|---|---|---|
| unit + integration | Vitest | latest | none yet — see Phase 2 (unit) and Phase 3 (integration) |
| API mocking | none yet | — | Phase 2 mocks only the OpenRouter fetch boundary directly; no MSW needed at this scale |
| e2e | Playwright | latest | none yet — see Phase 1; matches this repo's existing `.claude/skills/10x-e2e` assumption |
| accessibility | none | — | not justified by cost×signal for a solo MVP at this stage |
| (optional) AI-native | none | n/a | no AI-native test tooling recommended yet — no MCP available in-session to ground a current recommendation, and cost×signal doesn't justify one over the classic layers above at this scale |

**Stack grounding tools (current session):**
- Docs: none available in current session (no Context7/framework-docs MCP found) — checked: 2026-09-13
- Search: WebSearch available — not used for this write-up, local manifests/config were sufficient — checked: 2026-09-13
- Runtime/browser: no Playwright MCP available; a `claude-in-chrome` skill exists for interactive browser driving but is a different mechanism than a Playwright test suite — checked: 2026-09-13
- Provider/platform: Linear MCP available (issue tracking, not used for gating here); no GitHub/Cloudflare/Supabase MCP (CLI access available instead) — checked: 2026-09-13

## 5. Quality Gates

| Gate | Where | Required? | Catches |
|---|---|---|---|
| lint + typecheck | local + CI | required (already wired) | syntactic / type drift |
| unit | local + CI | required after §3 Phase 2 | AI-parsing, provider-error, input-validation regressions |
| integration | local + CI | required after §3 Phase 3 | DB-trigger and rating-retry regressions |
| e2e on critical flows | CI on PR | required after §3 Phase 1 | broken critical user paths, cross-user access-control regressions |
| pre-prod smoke | between merge + prod | optional | environment-specific failures (e.g. a migration applied locally but not to production — hit this exact gap earlier this session) |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase <N>."

### 6.1 Adding a unit test

- TBD — see §3 Phase 2 (AI-generation safety net: parsing/validation pattern).

### 6.2 Adding an integration test

- TBD — see §3 Phase 3 (business-rule integration coverage: real-Supabase pattern).

### 6.3 Adding an e2e test

- TBD — see §3 Phase 1 (critical-path access control: seeded-two-user pattern).

### 6.4 Adding a test for a new API endpoint

- TBD — see §3 Phase 3.

### 6.5 Per-rollout-phase notes

(Fills in after each phase lands.)

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **Visual/pixel-perfect UI snapshot tests** — solo MVP, styling changes constantly; snapshot tests would break on every intentional style change and catch nothing meaningful. Re-evaluate if the team grows beyond a solo contributor or the UI stabilizes post-v1. (Source: Phase 2 interview Q5.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-09-13
- Stack versions last verified: 2026-09-13
- AI-native tool references last verified: 2026-09-13

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
