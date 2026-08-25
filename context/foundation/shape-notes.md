---
project: "10xCards"
context_type: greenfield
created: 2026-08-24
updated: 2026-08-24
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 2
  hard_deadline: 2026-09-08
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "pain category"
      decision: "workflow friction — spaced repetition is wanted, card authoring is the tedious blocker"
    - topic: "insight"
      decision: "LLMs only recently became reliable enough for quality Q&A extraction; existing tools invested in review algorithms, not card authoring"
    - topic: "primary persona scope"
      decision: "self-directed learner, any subject, no institution/syllabus"
    - topic: "trigger moment"
      decision: "just finished reading source material, wants to convert to cards while fresh"
    - topic: "login method"
      decision: "email + password"
    - topic: "role separation"
      decision: "flat — no admin/member distinction for MVP"
    - topic: "MVP flow review step"
      decision: "review & approve/reject each AI-generated card before saving"
    - topic: "study session in MVP"
      decision: "yes — study session ships in v1"
    - topic: "scope-down move"
      decision: "v1 is AI-generation only; manual creation deferred to v1.1; SRS library used at defaults, no custom tuning; primary flow narrowed to generate→review→save→study"
    - topic: "AI-usage-share success criterion"
      decision: "dropped for v1 (trivially 100% since AI is the only path); becomes meaningful in v1.1"
    - topic: "mvp_weeks estimate"
      decision: "revised from 3 to 2 weeks after-hours, to match the 2026-09-08 hard deadline; scope kept as-is (11 FRs), deemed still achievable at 2 weeks"
    - topic: "US-01 acceptance criteria"
      decision: "text length 100-10,000 chars; cap ~20 candidates per request; rejected candidates discarded"
    - topic: "business logic rule"
      decision: "app identifies key facts/concepts in source text and reformulates each as a Q&A pair testing recall"
    - topic: "NFRs"
      decision: "visible feedback >2s ops; non-AI actions <1s; explicit AI-failure messaging; privacy — never expose one user's text/cards to another"
    - topic: "product_type / target_scale"
      decision: "web-app; small scale (just the user, or a handful); domain rule confirmed scale-independent"
    - topic: "timeline"
      decision: "hard_deadline 2026-09-08; mvp_weeks reconciled to 2 weeks to match; after-hours only"
    - topic: "non-goals"
      decision: "manual creation (v1.1), own SRS algorithm, multi-format import, deck sharing, third-party integrations, mobile apps, search/filter (v1.1), de-dup (v1.1)"
  frs_drafted: 11
  quality_check_status: accepted
---

# Shape Notes

Seed idea (from `idea-notes.md`):

> Manualne tworzenie wysokiej jakości fiszek edukacyjnych jest czasochłonne, co zniechęca do korzystania z efektywnej metody nauki jaką jest spaced repetition.
>
> Najmniejszy zestaw funkcjonalności:
> - Generowanie fiszek przez AI na podstawie wprowadzonego tekstu (kopiuj-wklej)
> - Manualne tworzenie fiszek
> - Przeglądanie, edycja i usuwanie fiszek
> - Prosty system kont użytkowników do przechowywania fiszek
> - Integracja fiszek z gotowym algorytmem powtórek
>
> Co NIE wchodzi w zakres MVP:
> - Własny, zaawansowany algorytm powtórek (jak SuperMemo, Anki)
> - Import wielu formatów (PDF, DOCX, itp.)
> - Współdzielenie zestawów fiszek między użytkownikami
> - Integracje z innymi platformami edukacyjnymi
> - Aplikacje mobilne (na początek tylko web)
>
> Kryteria sukcesu:
> - 75% fiszek wygenerowanych przez AI jest akceptowane przez użytkownika
> - Użytkownicy tworzą 75% fiszek z wykorzystaniem AI

## Vision & Problem Statement

Manual creation of high-quality educational flashcards is time-consuming — this is workflow friction, not a missing capability or decision paralysis. The value of spaced repetition as a learning method is well understood and wanted, but the tedium of authoring cards by hand discourages people from adopting or sustaining the practice. A self-directed learner (studying independently — a language, a skill, a certification, any subject with no institution or syllabus forcing the pace) hits this friction the moment they finish reading source material (an article, notes, a chapter) and want to turn it into study-ready cards while it's fresh. Today, that person either skips spaced repetition entirely because manual authoring is too tedious to sustain, or burns disproportionate time hand-writing Q&A pairs instead of studying.

The insight that makes this worth building now: LLMs only recently became reliable enough to extract quality Q&A pairs from arbitrary source text. Existing tools (Anki, SuperMemo, Quizlet) invested their engineering effort into review-scheduling algorithms and left card authoring as a manual afterthought. The gap isn't that AI-generated flashcards is a novel idea — it's that the underlying generation quality only recently became good enough to trust.

## User & Persona

**Primary persona**: Self-directed learner — an individual studying independently (a language, a skill, a certification, or any subject) without an institution or syllabus dictating pace or content. They read source material on their own initiative and are motivated to retain it long-term via spaced repetition, but authoring flashcards by hand is friction they'd rather not pay.

## Success Criteria

**Scope note**: The MVP flow was originally sketched with ~10 actions across four paths (AI generate→review→save, manual creation, browse/edit/delete, study session) and two external integrations (LLM API, SRS library) before payoff — bigger than a 3-week after-hours target. Scoped down: **v1 is AI-generation only**; manual flashcard creation is deferred to v1.1. The primary flow that proves v1 works is: paste text → AI generates candidate cards → user reviews (accept/edit/reject) → accepted cards saved → user studies via a minimal/default-configuration SRS library (no custom scheduling tuning). Browse/edit/delete of saved cards still ships in v1 as a supporting FR, off the critical path. Timeline note: the target is a 2026-09-08 hard deadline, reconciled to a 2-week after-hours estimate — the scoped-down 11-FR list was reassessed and judged still achievable at that tighter window.

### Primary
- 75% of AI-generated flashcards are accepted by the user (unedited or after light edit, not rejected).

### Secondary
- Users return for a study session within 7 days of generating cards.

### Guardrails
- Source text and generated cards are private to the user — no cross-user leakage.
- AI generation must not silently fail — the user always gets clear success/failure feedback.

*(Note: the original "users create 75% of flashcards using AI" criterion is deferred — it becomes meaningful once v1.1 adds manual creation as an alternate path. Not tracked for v1 since AI is the only creation path.)*

## User Stories

### US-01: User converts pasted text into study-ready flashcards

- **Given** a logged-in user with source text they want to turn into flashcards
- **When** they paste the text and trigger AI generation
- **Then** they see a batch of candidate flashcards they can accept, edit, or reject before any are saved

#### Acceptance Criteria
- Pasted source text must be between 100 and ~10,000 characters; outside that range the user gets a clear validation message instead of a silent failure or a hung request.
- At most ~20 candidate cards are generated per request.
- Rejected candidates are discarded, not saved anywhere (no soft-delete/archive).
- Accepted candidates (as-is or after edit) are saved to the user's collection and immediately visible in their flashcard list.

## Functional Requirements

### Authentication
- FR-001: User can sign up with email + password. Priority: must-have
  > Socrates: Counter-argument considered: "a magic link would avoid
  > verification/forgot-password friction." Resolution: kept; magic link
  > requires equally reliable transactional email infra, not actually simpler
  > for MVP.
- FR-002: User can log in with email + password. Priority: must-have. Session persists for a reasonable duration; no aggressive timeout that logs a user out mid-study.
  > Socrates: Counter-argument considered: "undefined session expiry could log
  > users out mid-study." Resolution: kept; closed the gap by adding the
  > session-persistence acceptance criterion above.

### AI flashcard generation
- FR-003: User can paste source text into a text input (plain text only, no format guarantees beyond the length bounds already set). Priority: must-have
  > Socrates: Counter-argument considered: "messy/unstructured input could
  > hurt AI generation quality." Resolution: kept; scoped explicitly to
  > plain-text paste, length bounds (100–10,000 chars, see US-01) already
  > guard against the worst cases.
- FR-004: User can trigger AI generation of flashcard candidates from the pasted text. Priority: must-have
  > Socrates: Counter-argument considered: "full dependency on a paid
  > third-party LLM API is a single point of failure." Resolution: kept; AI
  > generation IS the core value prop, so removing it isn't viable — mitigated
  > via an NFR requiring clear failure feedback when the AI call fails.
- FR-005: User can review each AI-generated candidate and accept, edit, or reject it. A bulk "accept all" action is available alongside per-card review. Priority: must-have
  > Socrates: Counter-argument considered: "per-card review of up to 20 cards
  > could feel as tedious as the manual authoring it replaces." Resolution:
  > kept; added a bulk accept-all fast path so per-card review isn't forced.
- FR-006: Accepted flashcards are saved to the user's collection. Priority: must-have
  > Socrates: Counter-argument considered: "no de-duplication check means
  > pasting similar text twice could silently create duplicate cards."
  > Resolution: kept as-is for v1; de-dup logic routed to Open Questions.

### Flashcard management
- FR-007: User can view their saved flashcards. Priority: must-have
  > Socrates: Counter-argument considered: "a flat, unorganized list won't
  > scale past a small collection — no search/filter." Resolution: kept as-is
  > for v1; a flat chronological list is enough to prove the concept,
  > search/filter noted for v1.1.
- FR-008: User can edit a saved flashcard. Editing a card's content resets its SRS schedule to "new". Priority: must-have
  > Socrates: Counter-argument considered: "editing a card after several SRS
  > study reps could corrupt its scheduling state." Resolution: kept; made
  > the behavior explicit — an edit resets the card to unreviewed.
- FR-009: User can delete a saved flashcard. Deletion requires a confirmation step. Priority: must-have
  > Socrates: Counter-argument considered: "hard delete with no confirmation
  > risks accidental loss of study material." Resolution: kept; added a
  > confirmation guard before deletion is final.

### Study / spaced repetition
- FR-010: User can start a study session that surfaces cards due per the SRS schedule. An explanatory empty-state is shown when no cards are due. Priority: must-have
  > Socrates: Counter-argument considered: "no defined empty-state for the
  > zero-cards-due case could confuse the user." Resolution: kept; added the
  > empty-state acceptance criterion above.
- FR-011: User can rate their recall of a card during study using a simple binary rating ("remembered" / "forgot"), and the SRS algorithm schedules its next review accordingly. Priority: must-have
  > Socrates: Counter-argument considered: "the recall-rating scale was
  > unspecified — ambiguity could stall implementation." Resolution: kept;
  > locked to a binary rating, simplest to implement against most SRS
  > libraries' default APIs.

## Non-Functional Requirements

- The user sees visible progress/loading feedback for any operation — especially AI generation — that takes longer than 2 seconds; no operation leaves the user staring at an unresponsive screen.
- Non-AI actions (browsing, editing, deleting cards, starting/running a study session) respond to the user within ~1 second.
- A failed or errored AI generation call surfaces a clear, explicit failure message to the user — never a silent no-op.
- Source text and generated flashcards are never exposed to any user other than their owner.

## Business Logic

The app identifies the key facts and concepts in a user's pasted source text and reformulates each as a question-answer pair that tests recall of that fact. The rule consumes a block of user-pasted source text (100–10,000 characters) as input. Its output is a bounded batch (up to ~20) of candidate question-answer flashcard pairs, each representing one distinct fact or concept drawn from the source text. The user encounters this rule immediately after pasting text and triggering generation: they're shown the candidate batch and decide, per card, whether the extracted fact and its phrasing are worth keeping.

## Access Control

Login via email + password. Flat access model — every account is the same, no admin/member role separation for MVP. Each user only sees and manages their own flashcards; there is no cross-user sharing (explicit MVP non-goal — see `## Non-Goals`).

## Non-Goals

- **Manual flashcard creation** — deferred to v1.1; v1 is AI-generation only. Keeps v1 scope small enough for the 3-week target.
- **Own spaced-repetition algorithm** — will use an existing SRS library/algorithm rather than building a custom one (e.g. SuperMemo/Anki-style). Building scheduling logic from scratch is out of scope for this product's value prop.
- **Multi-format import (PDF, DOCX, etc.)** — plain-text copy-paste only. Parsing other formats is a separate, non-trivial problem.
- **Sharing/collaborative flashcard decks between users** — single-tenant; no cross-user sharing of decks or cards.
- **Integrations with other educational platforms** — no import/export to third-party platforms in v1.
- **Mobile apps** — web only for now.
- **Search/filter on the flashcard list** — deferred to v1.1; v1 ships with a flat chronological list.
- **De-duplication checking on saved cards** — deferred to v1.1; no duplicate detection in v1.

## Quality cross-check

All required elements present at the Phase 7 gate — Access Control, Business Logic (one-sentence rule), Project artifacts, Timeline-cost acknowledgment (mvp_weeks: 2, ≤ 3), Non-Goals (8 entries). Preserved behavior is n/a (greenfield). No gaps recorded.

## Open Questions

1. **Should saving a flashcard check for duplicates against existing cards (e.g. near-identical front text)?** — Deferred from FR-006's Socrates round. Owner: user. Not blocking v1; revisit if duplicate cards become a real nuisance.
2. **Should the flashcard list support search/filter?** — Deferred from FR-007's Socrates round. Owner: user. Targeted for v1.1, alongside manual card creation.
