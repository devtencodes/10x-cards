# AI-Generated Flashcards — Plan Brief

> Full plan: `context/changes/ai-generated-flashcards/plan.md`

## What & Why

Build S-02, the PRD's north star: a user pastes source text, triggers AI generation via OpenRouter, reviews each candidate (accept/edit/reject, plus bulk accept-all), and accepted cards save and are immediately visible in a flashcard list. This is the flow the primary success metric (75% acceptance rate) measures.

## Starting Point

F-01's `flashcards`/`review_schedules` schema exists and is RLS-scoped, with `flashcards.source` already anticipating an `ai_generated`/`ai_edited` split. No LLM dependency, no JSON API surface, and no flashcard UI exist yet — the only API pattern in the app is auth's form-POST-and-redirect, which doesn't fit a multi-card review flow.

## Desired End State

An authenticated user visits `/generate`, pastes text, sees generated candidates they can edit/accept/reject or bulk-accept, saves them, and lands on `/flashcards` seeing their new cards immediately.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| OpenRouter integration | Raw `fetch`, no new SDK | Zero new dependencies; full control over a single call site. |
| Model selection | Env-configurable (`OPENROUTER_MODEL`), defaults to a free-tier model | `OPENROUTER_API_KEY` has a $0.00 budget — paid models would fail outright. |
| Timeout/retry | 30s hard timeout, no auto-retry | Simple, predictable; user stays in control of retries. |
| Failure UX | One generic failure message + retry button | Satisfies the NFR's "never a silent no-op" without leaking provider details. |
| Review UI layout | Single page, all candidates as editable cards | Keeps FR-005's bulk accept-all fast path usable — needs the whole batch visible. |
| Bulk accept behavior | Marks accepted, still requires a final Save click | One consistent save path regardless of how cards were accepted. |
| List scope this slice | Minimal read-only list (front text + date) | Satisfies US-01's "immediately visible" AC without duplicating S-03's edit/delete scope. |
| Save request shape | One batched API call | One round-trip; a single multi-row `INSERT` is already atomic. |
| Partial-save handling | All-or-nothing (single transaction) | Simplest mental model; server-side validation should make mid-batch failure rare. |
| Input validation | Both client pre-check and server-authoritative | Matches the existing `SignUpForm` validation pattern; better UX than server-only. |
| Rate limiting | None for v1 | Small-scale, single-tenant MVP with no traffic yet. |
| Testing | Manual verification only | No test framework exists yet in this repo; matches current project maturity. |
| 404 page | Out of scope, separate change | Unrelated to S-02's PRD scope — would be scope creep on this roadmap item. |

## Scope

**In scope:** OpenRouter-backed generation API, save API, paste+review+save React UI, a minimal read-only flashcard list page, navigation links from the dashboard, adding both new pages to the existing `PROTECTED_ROUTES` redirect mechanism.

**Out of scope:** manual flashcard creation, duplicate detection, search/filter, edit/delete of saved cards (S-03), spaced-repetition/study UI (S-04), a new automated test framework, rate limiting, a custom 404 page.

## Architecture / Approach

Two new JSON API routes (`/api/flashcards/generate`, `/api/flashcards/save`) — the app's first JSON API surface, distinct from auth's form-POST-and-redirect pattern — each checking `context.locals.user` directly (401 on failure) rather than relying on `PROTECTED_ROUTES`'s page-redirect behavior. A React island (`GenerateFlow`) holds all candidate state client-side (nothing is persisted until save); a minimal server-rendered `/flashcards` page reads directly from the RLS-scoped Supabase client with no extra filtering needed.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. OpenRouter generation API | `POST /api/flashcards/generate`, curl-testable, no UI | Free-tier model quality/availability could affect the 75% acceptance criterion |
| 2. Flashcard save API | `POST /api/flashcards/save`, atomic batch insert | None significant — thin layer over already-verified RLS/schema |
| 3. Generate + review UI | Full paste→generate→review→save React flow | Getting the accept/edit/reject/bulk-accept state model right — most novel UI in the app so far |
| 4. Minimal list + navigation | `/flashcards` page, dashboard links | Coordinating with S-03, which will extend this same list page later |

**Prerequisites:** F-01 (done), S-01 (done), `OPENROUTER_API_KEY` provisioned (confirmed) — all clear.
**Estimated effort:** ~2-3 sessions across 4 phases — this is the project's largest remaining slice.

## Open Risks & Assumptions

- `OPENROUTER_API_KEY`'s $0.00 budget means generation quality is bounded by whatever free-tier model is available at implementation time — if the 75% acceptance criterion isn't met, adding budget and switching `OPENROUTER_MODEL` to a paid model is the documented escape hatch (config change, not code change).
- OpenRouter's free-tier model catalog rotates — the plan's default model ID should be re-verified against `GET /api/v1/models` before implementation if any time has passed since planning.
- Structured JSON output from the model is best-effort, not guaranteed — defensive parsing carries real weight here.

## Success Criteria (Summary)

- A user can paste text, generate candidates, review/edit/reject/bulk-accept, save, and see the result immediately on `/flashcards`.
- Generation failures always show a clear message and a working retry — never a silent no-op.
- `npx astro check && npm run build && npm run lint` all pass.
