<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: AI-Generated Flashcards Implementation Plan

- **Plan**: context/changes/ai-generated-flashcards/plan.md
- **Scope**: Phase 1 of 4
- **Date**: 2026-09-12
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Grounding

- Drift-detection sub-agent: all 5 Phase 1 files (astro.config.mjs, .env.example, src/lib/config-status.ts, src/lib/openrouter.ts, src/pages/api/flashcards/generate.ts) MATCH their contracts, including the mid-phase model swap (nvidia/nemotron-3.5-lightning → liquid/lfm-2.5-2.6b:free) and the strengthened bracket-depth JSON extraction — both already reflected in the plan text at review time, so not drift.
- Safety/pattern sub-agent: no CRITICAL findings; auth-check pattern, error-object shape, naming, file placement, and TypeScript strictness all consistent with the codebase.
- Automated verification re-run at review time: `npx astro check` (0 errors), `npm run build` (success), `npm run lint` (0 errors, 3 pre-existing `no-console` warnings on the debug-logging additions).
- Manual verification (1.4–1.7): evidenced live in conversation — 3 consecutive real `200` responses with well-formed candidates, a `401` on no session, a `400` on out-of-range text, and a `502` with a deliberately-broken API key. Not rubber-stamped.

## Findings

### F1 — No rate limiting on an LLM-backed endpoint

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/flashcards/generate.ts (whole handler)
- **Detail**: The route only checks `context.locals.user` before calling OpenRouter — no per-user/per-IP throttle. The plan's "What We're NOT Doing" already excludes rate limiting for v1 (rationale: small-scale, single-tenant MVP, cost focus), so this isn't unplanned scope — but the angle here is slightly different from the plan's cost framing: on a **shared free-tier model**, one user firing repeated 10,000-char requests can exhaust the request/rate quota for *every* user of the app, not just run up a bill. Worth a conscious re-confirm rather than an unexamined carry-over.
- **Fix A ⭐ Recommended**: Accept as already-decided plan scope; revisit only if real usage shows quota contention.
  - Strength: Consistent with the plan's documented decision; zero cost now; matches the project's "keep to stated acceptance criteria, no extra polish" risk note for this slice.
  - Tradeoff: The shared-quota exhaustion risk (as opposed to the plan's billing framing) stays live until addressed.
  - Confidence: HIGH — this is a conscious, already-recorded decision, not a gap the phase silently introduced.
  - Blind spot: No visibility yet into actual free-tier request-rate limits for the current model.
- **Fix B**: Add a lightweight per-user cooldown now (in-memory or KV-backed).
  - Strength: Closes the quota-exhaustion risk immediately.
  - Tradeoff: Expands Phase 1 scope beyond what was planned/reviewed; needs its own mini-design (storage choice, window/reset policy).
  - Confidence: MEDIUM — straightforward in principle, but no existing pattern in this codebase to follow.
  - Blind spot: Haven't checked whether Cloudflare KV is already provisioned for this project.
- **Decision**: ACCEPTED (Fix A — no code change; reaffirms the plan's existing "What We're NOT Doing" scope decision)

### F2 — User source text may land in server logs on parse failure

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/openrouter.ts:102, 110
- **Detail**: `console.error` logs the full raw model response (which restates facts from the user's source text) on parse failure. Reasonable as debug logging for a known failure mode, but full-text logging of user-submitted content is worth a conscious call before this handles real user content at scale.
- **Fix**: Truncate logged content to a fixed length (e.g., first 500 chars) instead of the full `JSON.stringify(raw)`.
- **Decision**: FIXED — added `LOG_PREVIEW_LENGTH = 500` and both `console.error` calls now log `raw.slice(0, LOG_PREVIEW_LENGTH)`.

### F3 — No fail-fast when OpenRouter isn't configured

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/openrouter.ts (Authorization header), src/pages/api/flashcards/generate.ts
- **Detail**: If `OPENROUTER_API_KEY` is unset, the code still performs a live fetch with an empty bearer token, which OpenRouter rejects — surfaced as the same generic `502` as any transient failure. `src/lib/config-status.ts` already tracks this `configured` boolean for the UI banner but the route doesn't consult it.
- **Fix**: Short-circuit to a `503` when `!OPENROUTER_API_KEY` instead of round-tripping to OpenRouter.
- **Decision**: FIXED — `generate.ts` now imports `OPENROUTER_API_KEY` from `astro:env/server` and returns `503 { error: "AI generation is not configured." }` before calling `generateFlashcardCandidates`.

### F4 — `OPENROUTER_MODEL` declared `access: "secret"`

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: astro.config.mjs
- **Detail**: The model identifier isn't sensitive (it's already plaintext in `.env.example`) but is declared `access: "secret"` like the real API key. Harmless, and actually matches this codebase's existing convention of declaring every server env field as `"secret"` (both `SUPABASE_URL`/`SUPABASE_KEY` do the same) — flagging for awareness only.
- **Fix**: Optional — change to `access: "public"` to better reflect its non-sensitive nature, if the team wants to start distinguishing secret vs. plain config going forward.
- **Decision**: FIXED — `OPENROUTER_MODEL` in astro.config.mjs now uses `access: "public"`.

### F5 — Prompt injection is inherent (awareness only)

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/openrouter.ts (buildPrompt)
- **Detail**: User text is interpolated directly into the prompt with no escaping. Since the only consumer of the model's output is the same authenticated user (no downstream privileged action, no cross-user data), impact is low today — worst case is a malformed/off-topic candidate array, already tolerated by the defensive parser.
- **Fix**: None needed now. Revisit only if a future phase adds a downstream privileged action driven by model output.
- **Decision**: SKIPPED

### F6 — Unbounded body buffering before length check

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/flashcards/generate.ts:14, 21
- **Detail**: `context.request.json()` fully parses the body before the 100–10,000-char check runs. Mitigated by Cloudflare Workers' platform-level body/memory caps and the pre-existing auth gate.
- **Fix**: None needed now — low impact, contained to the offending request.
- **Decision**: SKIPPED
