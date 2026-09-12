# AI-Generated Flashcards Implementation Plan

## Overview

Implement S-02, the PRD's north star flow: a user pastes source text, triggers AI generation via OpenRouter, reviews each candidate (accept, edit, or reject — plus bulk accept-all), and accepted cards are saved and immediately visible in a flashcard list. This is the first LLM integration and the first JSON API surface in the app.

## Current State Analysis

- `flashcards` and `review_schedules` tables exist (F-01, archived) with RLS scoped to `auth.uid() = user_id`. `flashcards.source` is a CHECK-constrained enum: `'ai_generated' | 'ai_edited'` — already anticipating the accept-as-is vs. accept-after-edit distinction this plan needs. Saving a `flashcards` row auto-creates its `review_schedules` row via trigger — no application code manages that table.
- No candidates/staging table exists, and `source` has no "pending" value — generated candidates are never persisted; they live in client-side React state until the user saves.
- No AI/LLM dependency exists in `package.json` — this is a from-scratch integration.
- `OPENROUTER_API_KEY` is provisioned on the live Cloudflare Worker (confirmed via `wrangler secret list`) but **has a $0.00 budget set in openrouter.ai account settings** — any call to a paid model will fail. Not yet present in local `.dev.vars`/`.env` or `astro.config.mjs`'s env schema.
- Existing API routes (`src/pages/api/auth/*.ts`) use HTML-form POST + full-page redirect with a query-param error — this pattern doesn't fit a multi-card review UI and won't be reused for the new routes.
- `src/middleware.ts` populates `context.locals.user` on **every** request, but only *redirects* unauthenticated requests for page paths listed in `PROTECTED_ROUTES` (currently `["/dashboard"]`). It does not gate API routes.
- `src/lib/supabase.ts`'s client is typed against `Database` (from F-01's Phase 3) — `flashcards`/`review_schedules` table/column names are available with compile-time checking.
- `src/lib/config-status.ts` + `Layout.astro`'s banner already generalize over a `configStatuses` array (currently just Supabase) to show a "not configured" warning banner — adding an OpenRouter entry costs one array item, no other changes.

## Desired End State

An authenticated user can visit `/generate`, paste 100–10,000 characters of text, click Generate, see up to 20 AI-generated candidate flashcards they can individually accept/edit/reject or bulk-accept, click Save, and land on `/flashcards` where their newly saved cards are immediately visible. Both new pages redirect unauthenticated visitors to `/auth/signin` via the existing `PROTECTED_ROUTES` mechanism.

**Verification**: `npx astro check && npm run build && npm run lint` all pass; a full manual walkthrough (paste → generate → edit one candidate → reject one → accept-all remaining → save → see cards on `/flashcards`) succeeds; a client-side validation message (not a network call) appears for out-of-range text length; a generation failure (e.g. invalid API key) shows the generic failure message with a working retry, never a silent no-op.

### Key Discoveries:

- `flashcards.source`'s exact two-value enum (`ai_generated` / `ai_edited`) means "was this card edited before saving" is the only source-tracking decision needed — no richer provenance model required.
- OpenRouter's structured outputs (`response_format: { type: "json_schema", ... }`) are "supported by select models" and can vary by provider/time — the generation client must defensively parse the raw response regardless of whether structured output was honored.
- A single Supabase JS `.insert([...])` call with multiple rows compiles to one SQL `INSERT` statement — atomic all-or-nothing without needing an explicit RPC or transaction wrapper.

## What We're NOT Doing

- Manual flashcard creation (PRD non-goal, deferred to v1.1).
- Duplicate detection, search/filter on the flashcard list (PRD non-goals / v1.1).
- Edit or delete of saved flashcards (S-03's job) — the `/flashcards` page this plan builds is read-only (front text + created date), extended by S-03 later.
- Any spaced-repetition/study UI (S-04's job) — `review_schedules` rows are created automatically by the existing trigger; this plan never reads or writes that table directly.
- A custom 404 page — explicitly deferred to a separate change; out of scope for this roadmap item.
- Any new automated test framework/suite — success criteria rely on `astro check`/`build`/`lint` plus manual verification, matching this project's current testing maturity.
- Per-user rate limiting on generation requests.
- Categorized/specific failure messages by error type — one generic failure message covers all generation failure modes for v1.
- Retrying a failed generation automatically — the user re-triggers manually.

## Implementation Approach

Four phases, backend-before-frontend: (1) the OpenRouter-backed generation API in isolation, curl-testable without any UI; (2) the save API, equally isolated; (3) the React review UI wired to both APIs; (4) the minimal list page plus navigation, satisfying the "immediately visible" acceptance criterion and closing the loop. This lets Phases 1–2 be verified against the real OpenRouter/Supabase backends before any UI code depends on their contracts.

## Critical Implementation Details

**OpenRouter model catalog rotates**: free-tier model availability and IDs change over time. This plan defaults `OPENROUTER_MODEL` to `liquid/lfm-2.5-2.6b:free` (confirmed listed at `GET https://openrouter.ai/api/v1/models` on 2026-09-12; purpose-described for agent workflows/data extraction/RAG, 65,536-token context, output capped at 8,192 tokens). This supersedes the plan's original default, `nvidia/nemotron-3.5-lightning:free` — Phase 1 manual verification hit that model's reasoning/chain-of-thought behavior directly: identical requests produced malformed JSON at ~6.5s in one run and a hard 30s timeout in another, both consistent with unpredictable latency and non-JSON text leaking into the response content. Before wiring in either model, re-verify it's still listed — if not, swap the env var default to another currently-listed free-tier model; this is a config change, not a code change.

**No structured-output hint — prompt + defensive parsing only**: do not send `response_format: { type: "json_schema", ... }`. OpenRouter's own docs state that a model/route not supporting structured outputs makes **the whole request fail with an error** — that's a hard non-2xx failure, not a graceful degrade, so requesting it would trade "maybe cleaner JSON" for "this free-tier model swap silently breaks 100% of generations." Instead, instruct the desired `{ front, back }` array shape entirely via the prompt, and always defensively parse the response body: scan for the first top-level JSON array in the raw text (bracket-depth tracking that's aware of quoted strings, so it ignores any prose, code-fence markers, or — as observed in Phase 1 manual testing with a compact free-tier model — the model restating its answer more than once in the same response) and `JSON.parse` just that substring, then validate the result is an array of `{ front: string; back: string }` objects with non-empty trimmed strings, drop malformed entries, and cap at 20. A response that yields zero valid candidates after parsing is a **successful** empty result (`{ candidates: [] }`, HTTP 200) — distinct from a response that can't be parsed as JSON at all, which is a **failure** (generic error response). The UI must handle the empty-array case gracefully (a "no candidates found, try different text" message), not treat it as an error.

**Auth boundary for the new JSON routes**: unlike page routes, `src/middleware.ts`'s `PROTECTED_ROUTES` redirect would break a `fetch()` caller (it'd receive sign-in page HTML, not JSON). Both new API routes must check `context.locals.user` themselves at the top of the handler and return `401` with a JSON body (`{ error: "Unauthorized" }`) — do not add `/api/flashcards/*` to `PROTECTED_ROUTES`.

**Source field derivation**: the client tracks each candidate's original `front`/`back` alongside its current (possibly edited) values. At save time, a card's `source` is `'ai_edited'` if either field differs from its original generated value, else `'ai_generated'`. This is computed client-side and sent as part of the save request; the server still validates `source` is one of the two allowed values (defense in depth against a malformed client request).

## Phase 1: OpenRouter generation API

### Overview

Add OpenRouter configuration and a `POST /api/flashcards/generate` endpoint that turns pasted text into candidate flashcards, with no UI dependency — testable directly via `curl` against a running dev server.

### Changes Required:

#### 1. Environment schema

**File**: `astro.config.mjs`

**Intent**: Register the two new env vars the same way `SUPABASE_URL`/`SUPABASE_KEY` are already registered, so they're typed and available via `astro:env/server`.

**Contract**: Add `OPENROUTER_API_KEY: envField.string({ context: "server", access: "secret", optional: true })` and `OPENROUTER_MODEL: envField.string({ context: "server", access: "secret", optional: true, default: "liquid/lfm-2.5-2.6b:free" })` to the existing `env.schema` object.

#### 2. Local env example

**File**: `.env.example`

**Intent**: Document the two new vars for local setup, matching the existing `SUPABASE_URL`/`SUPABASE_KEY` placeholder style.

**Contract**: Append `OPENROUTER_API_KEY=###` and `OPENROUTER_MODEL=liquid/lfm-2.5-2.6b:free`.

#### 3. Config status banner entry

**File**: `src/lib/config-status.ts`

**Intent**: Surface a "not configured" banner (same mechanism as the existing Supabase entry) if `OPENROUTER_API_KEY` is missing, so a misconfigured deployment fails visibly instead of silently 500-ing on first generation attempt.

**Contract**: Add one more object to the `configStatuses` array: `{ name: "OpenRouter", configured: Boolean(OPENROUTER_API_KEY), message: "OpenRouter nie jest skonfigurowany — generowanie fiszek AI jest wyłączone." }` (match the existing Polish-language message style), importing `OPENROUTER_API_KEY` from `astro:env/server`.

#### 4. OpenRouter client

**File**: `src/lib/openrouter.ts` (new)

**Intent**: Isolate the raw-fetch call to OpenRouter and the defensive response parsing so the API route stays thin. Exports one function: `generateFlashcardCandidates(text: string): Promise<{ front: string; back: string }[]>`.

**Contract**: POSTs to `https://openrouter.ai/api/v1/chat/completions` with `Authorization: Bearer ${OPENROUTER_API_KEY}`, `model: OPENROUTER_MODEL`, a prompt instructing the model to extract distinct facts/concepts from the given text and return a JSON array of `{ front, back }` question/answer pairs (question in `front`, answer in `back`), capped at 20 items, in the source text's language. No `response_format` is sent (see Critical Implementation Details — a model/route not supporting structured outputs fails the whole request, so the array shape is prompt-instructed only and enforced by defensive parsing — first-JSON-array extraction, not just fence-stripping — on the way back). Uses `AbortSignal.timeout(30000)` for the 30s hard timeout (no retry). On any failure (non-2xx response, timeout/abort, or a response body that can't be parsed into valid candidates at all), throws a single typed error (e.g. `GenerationError`) that the route handler catches uniformly. On success, returns the parsed, validated, capped-at-20 array (which may be empty — see Critical Implementation Details).

#### 5. Generate API route

**File**: `src/pages/api/flashcards/generate.ts` (new)

**Intent**: The JSON endpoint the review UI (Phase 3) calls to trigger generation.

**Contract**: `POST` handler. Returns `401 { error: "Unauthorized" }` if `context.locals.user` is absent. Reads `{ text: string }` from the JSON body; returns `400 { error: <message> }` if `text` is missing or its length is outside 100–10,000 characters (server-side is authoritative regardless of client-side pre-check). Calls `generateFlashcardCandidates(text)`; on success returns `200 { candidates: [...] }`; on any thrown `GenerationError` returns a single generic failure response (e.g. `502 { error: "Generation failed. Please try again." }`) — no error-type branching in the response body per the failure-UX decision.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Build passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- With a valid session cookie and a real `OPENROUTER_API_KEY` locally configured, `curl -X POST /api/flashcards/generate` with valid 100–10,000-char text returns `200` with a non-empty `candidates` array of well-formed `{front, back}` objects.
- The same request without a session cookie returns `401`.
- A request with text under 100 or over 10,000 characters returns `400`.
- Temporarily using an invalid `OPENROUTER_API_KEY` (or unplugging network) produces the generic `502`-style failure response, not a hang or a 500 with a raw stack trace.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Flashcard save API

### Overview

Add `POST /api/flashcards/save`, the endpoint the review UI calls once the user has decided which candidates to keep.

### Changes Required:

#### 1. Save API route

**File**: `src/pages/api/flashcards/save.ts` (new)

**Intent**: Persist the user's accepted (and possibly edited) candidates as `flashcards` rows in one atomic operation; `review_schedules` rows are created automatically by the existing F-01 trigger.

**Contract**: `POST` handler. Returns `401 { error: "Unauthorized" }` if `context.locals.user` is absent. Obtains the request-scoped client via `createClient(context.request.headers, context.cookies)` (same call as `signup.ts`/`signin.ts`) — this is the RLS-scoped, typed client used below, not something read off `locals`. Reads `{ cards: { front: string; back: string; source: "ai_generated" | "ai_edited" }[] }` from the JSON body. Returns `400 { error: <message> }` if `cards` is missing, empty, has more than 20 entries, or any entry fails validation (`front`/`back` length 1–2000 — matching the DB's own CHECK constraints — or `source` not one of the two allowed values). On valid input, performs one `supabase.from("flashcards").insert(cards.map(c => ({ ...c, user_id: locals.user.id })))` call (a single multi-row `INSERT` — see Critical Implementation Details for the atomicity argument). On success returns `201 { saved: <count> }` (a resource-creation endpoint — updated from the original `200` during Phase 2 review, see impl-review-phase-2.md F3). On a DB-level failure (e.g. a constraint violation that server-side validation didn't already catch) returns a generic `500 { error: "Save failed. Please try again." }` — the whole batch fails together, nothing partially saved.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Build passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- With a valid session, POSTing 1–20 well-formed cards returns `201` with the correct `saved` count, and querying `flashcards`/`review_schedules` as that user (e.g. via `psql`/Studio) shows the rows with matching `source` values and auto-created schedule rows.
- The same request without a session returns `401`.
- A request with an empty `cards` array, more than 20 cards, or a card with `front`/`back` over 2000 characters returns `400` and inserts nothing.
- As a second test user, confirm the first user's newly saved cards are invisible (RLS still enforced — no new policy touched this phase, but worth reconfirming against real writes through this new code path).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Generate + review UI

### Overview

The paste → generate → review (accept/edit/reject/bulk-accept) → save flow as a single page backed by a React island, calling the two APIs from Phases 1–2.

### Changes Required:

#### 1. Page shell

**File**: `src/pages/generate.astro` (new)

**Intent**: Host the `GenerateFlow` React island inside the existing `Layout` + cosmic-gradient card container style (matching `src/pages/auth/signup.astro`/`dashboard.astro`).

**Contract**: Renders `<Layout title="Generate flashcards">` wrapping `<GenerateFlow client:load />`.

#### 2. Protected route registration

**File**: `src/middleware.ts`

**Intent**: Reuse the existing sign-out redirect mechanism for the new page — no new auth logic needed.

**Contract**: Add `"/generate"` to the `PROTECTED_ROUTES` array.

#### 3. Main flow component

**File**: `src/components/flashcards/GenerateFlow.tsx` (new)

**Intent**: Orchestrates the whole client-side flow: text input with client-side length validation, triggering generation, holding candidate state, and triggering save.

**Contract**: A textarea bound to local state; a Generate button disabled while `text.length` is outside 100–10,000 (inline validation message shown, mirroring `SignUpForm`'s `validate()` pattern — no network call attempted when invalid). On click, sets a pending/loading state, `fetch("/api/flashcards/generate", { method: "POST", body: JSON.stringify({ text }) })`. On success with a non-empty `candidates` array, renders the candidate list (below) keyed by index, each seeded with `{front, back, originalFront: front, originalBack: back, status: "pending"}`. On success with an empty array, shows a "No candidates found — try different text" message. On failure, shows the generic failure message plus a "Try again" button that re-triggers the same request.

#### 4. Candidate card

**File**: `src/components/flashcards/CandidateCard.tsx` (new)

**Intent**: One candidate's accept/edit/reject controls and inline-editable fields.

**Contract**: Props include the candidate's current `front`/`back`, its `status` (`"pending" | "accepted" | "rejected"`), and callbacks for edit/accept/reject. Editing either field always implicitly counts as "accepted" (there's no separate edit-mode toggle beyond typing into the field) — status transitions are just `pending → accepted` (on any edit or explicit Accept click) or `pending → rejected` (on Reject click); a rejected card can be un-rejected back to pending. Rejected cards are visually de-emphasized but stay in the list (not removed) so the user can undo.

#### 5. Review list + save action

**File**: `src/components/flashcards/GenerateFlow.tsx` (same file as #3 — extended, or a co-located `CandidateList` sub-component if the file grows past a reasonable size; implementer's call)

**Intent**: Render all candidates, provide the bulk "Accept all" action, and the final Save action.

**Contract**: An "Accept all" button sets every `"pending"` candidate's status to `"accepted"` (rejected and already-accepted candidates are untouched). A "Save" button, enabled only when at least one candidate has status `"accepted"`, filters to accepted candidates, computes each one's `source` per the Critical Implementation Details rule (`front !== originalFront || back !== originalBack ? "ai_edited" : "ai_generated"`), and POSTs `{ cards: [...] }` to `/api/flashcards/save`. On success, redirects to `/flashcards` (e.g. `window.location.href = "/flashcards"`). On failure, shows the generic save-failure message without losing the current candidate state (user can retry Save without re-generating).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Build passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- Pasting text under 100 or over 10,000 characters shows an inline validation message and does not call the generate API.
- A full happy path — paste valid text, Generate, edit one candidate's back text, reject one candidate, click "Accept all" for the rest, click Save — succeeds and redirects to `/flashcards`.
- The edited candidate saves with `source = 'ai_edited'`; untouched accepted candidates save with `source = 'ai_generated'`; the rejected candidate is not saved.
- Triggering a generation failure (e.g. temporarily misconfigured API key) shows the generic failure message with a working "Try again" that re-attempts generation.
- Visiting `/generate` while signed out redirects to `/auth/signin`.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Minimal flashcard list + navigation

### Overview

Close the loop: a read-only list page satisfying US-01's "immediately visible in their flashcard list" acceptance criterion, plus navigation links so users can reach both new pages.

### Changes Required:

#### 1. List page

**File**: `src/pages/flashcards.astro` (new)

**Intent**: Show the signed-in user's saved flashcards, newest first. Read-only for this slice — editing/deleting is S-03's job, which will extend this same file rather than replace it.

**Contract**: In the frontmatter, obtain the request-scoped client via `createClient(Astro.request.headers, Astro.cookies)` — no existing `.astro` page queries data yet, so there's no client already in scope; if it returns `null` (Supabase not configured), skip the query and rely on the existing config-status banner rather than querying. Otherwise run `supabase.from("flashcards").select("id, front, created_at").order("created_at", { ascending: false })` (no explicit `user_id` filter needed — RLS already scopes to `auth.uid() = user_id`). Renders each row's `front` text (truncated if long) and `created_at` date in the existing card/list visual style. Shows an empty-state message ("No flashcards yet — Generate some") linking to `/generate` when the query returns zero rows.

#### 2. Protected route registration

**File**: `src/middleware.ts` (same file as Phase 3's edit — extended)

**Intent**: Same redirect-when-signed-out behavior as every other authenticated page.

**Contract**: Add `"/flashcards"` to the `PROTECTED_ROUTES` array (alongside the `"/generate"` entry added in Phase 3).

#### 3. Dashboard navigation

**File**: `src/pages/dashboard.astro`

**Intent**: Give users a way to reach the new pages — currently `/dashboard` only has a sign-out button.

**Contract**: Add two links styled consistently with the existing sign-out button: "Generate flashcards" → `/generate`, "My flashcards" → `/flashcards`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Build passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- As a fresh user with zero saved cards, `/flashcards` shows the empty state with a working link to `/generate`.
- After completing the Phase 3 happy path, `/flashcards` immediately shows the newly saved cards (front text + date) without a manual refresh needed beyond the post-save redirect.
- `/dashboard`'s new links navigate to `/generate` and `/flashcards` correctly.
- Visiting `/flashcards` while signed out redirects to `/auth/signin`.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Unit Tests:

- None — no automated test framework is introduced in this plan (matches current project maturity; see "What We're NOT Doing").

### Integration Tests:

- None automated. The Phase 1/2 manual `curl`/direct-DB checks and Phase 3/4 full-browser walkthrough are the closest equivalent, following the same pattern F-01 used for its RLS manual verification.

### Manual Testing Steps:

1. Configure `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` in local `.dev.vars`/`.env` (see Phase 1).
2. Run the full happy path end-to-end: sign in → `/generate` → paste text → generate → review (accept/edit/reject/bulk-accept) → save → land on `/flashcards` with the new cards visible.
3. Verify the client-side length validation, the generic failure-and-retry path, and the empty-candidates path (see each phase's manual criteria).
4. Verify unauthenticated redirects for both new pages.
5. Run `npx astro check && npm run build && npm run lint` to confirm everything compiles and lints cleanly.

## Performance Considerations

Generation is capped at 20 candidates per request and the OpenRouter call has a 30s hard timeout — the review UI must show a loading state for the whole wait (satisfying the NFR's ">2 seconds needs visible progress feedback" requirement) rather than appearing frozen. No other performance-sensitive paths are introduced (`review_schedules(user_id, due_at)`, F-01's index, isn't queried by this plan).

## Migration Notes

No schema changes — this plan only adds application code against F-01's existing tables. `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` need no migration since `OPENROUTER_API_KEY` is already a provisioned Cloudflare Workers Secret (confirmed 2026-09-12); `OPENROUTER_MODEL` is a plain (non-secret) config value that can ship with its code default and be overridden later without a redeploy blocker.

## References

- Roadmap item: `context/foundation/roadmap.md` (S-02: ai-generated-flashcards)
- PRD: `context/foundation/prd.md` (US-01, FR-003–FR-007, NFRs, Access Control)
- Schema this plan writes to: `context/archive/2026-09-07-flashcard-data-foundation/plan.md` (F-01, archived)
- Auth/API pattern precedent: `src/middleware.ts`, `src/pages/api/auth/signup.ts`, `src/components/auth/SignUpForm.tsx`
- OpenRouter structured outputs: https://openrouter.ai/docs/features/structured-outputs

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: OpenRouter generation API

#### Automated

- [x] 1.1 Type checking passes: `npx astro check` — af57b39
- [x] 1.2 Build passes: `npm run build` — af57b39
- [x] 1.3 Linting passes: `npm run lint` — af57b39

#### Manual

- [x] 1.4 Valid request returns 200 with well-formed candidates — af57b39
- [x] 1.5 Unauthenticated request returns 401 — af57b39
- [x] 1.6 Out-of-range text length returns 400 — af57b39
- [x] 1.7 Upstream/auth failure returns the generic failure response, not a hang or raw 500 — af57b39

### Phase 2: Flashcard save API

#### Automated

- [x] 2.1 Type checking passes: `npx astro check` — d2bf9fe
- [x] 2.2 Build passes: `npm run build` — d2bf9fe
- [x] 2.3 Linting passes: `npm run lint` — d2bf9fe

#### Manual

- [x] 2.4 Valid save request returns 200 with correct count; rows + auto-created schedules confirmed in DB — d2bf9fe
- [x] 2.5 Unauthenticated request returns 401 — d2bf9fe
- [x] 2.6 Invalid batch (empty, >20, oversized card) returns 400 and inserts nothing — d2bf9fe
- [x] 2.7 Second test user still cannot see first user's newly saved cards — d2bf9fe

### Phase 3: Generate + review UI

#### Automated

- [x] 3.1 Type checking passes: `npx astro check`
- [x] 3.2 Build passes: `npm run build`
- [x] 3.3 Linting passes: `npm run lint`

#### Manual

- [ ] 3.4 Out-of-range text shows inline validation, no API call made
- [ ] 3.5 Full happy path (generate → edit → reject → accept-all → save) succeeds and redirects to `/flashcards`
- [ ] 3.6 Edited candidate saves as `ai_edited`; untouched accepted candidates save as `ai_generated`; rejected candidate not saved
- [ ] 3.7 Generation failure shows generic message with working retry
- [ ] 3.8 Signed-out visit to `/generate` redirects to `/auth/signin`

### Phase 4: Minimal flashcard list + navigation

#### Automated

- [ ] 4.1 Type checking passes: `npx astro check`
- [ ] 4.2 Build passes: `npm run build`
- [ ] 4.3 Linting passes: `npm run lint`

#### Manual

- [ ] 4.4 Empty state shows for a fresh user with a working link to `/generate`
- [ ] 4.5 Newly saved cards immediately visible on `/flashcards` after the Phase 3 happy path
- [ ] 4.6 Dashboard links navigate correctly to `/generate` and `/flashcards`
- [ ] 4.7 Signed-out visit to `/flashcards` redirects to `/auth/signin`
