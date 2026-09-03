# GitHub task management: how `roadmap.md` got converted

This documents the conversion of `context/foundation/roadmap.md` into a live task-management
system: which system was chosen, what format was used, and what was actually created.

**`roadmap.md` is the narrative source of truth. GitHub is the actionable mirror.** The
markdown file is where the roadmap is authored, reasoned about, and regenerated (via
`/10x-roadmap`); GitHub Issues/milestone are a derived, checkbox-and-status view of it for
day-to-day tracking (assigning, closing, linking PRs, opening PRs against an issue). If the two
disagree, `roadmap.md` wins — reconcile GitHub to match it, not the other way around.

## 1. Task management system identified

The repo already has a GitHub remote
([`devtencodes/10x-cards`](https://github.com/devtencodes/10x-cards)) with the `gh` CLI
authenticated, and no other tracker (Jira, Linear, etc.) was wired in at the time. GitHub
Issues + Milestones was the natural fit: zero new tooling, lives next to the code and PRs, and
its labels/milestones/blocking-relations map cleanly onto the roadmap's own vocabulary
(streams, foundation vs. slice, ready vs. proposed).

## 2. Format proposed

Roadmap concept → GitHub primitive:

| Roadmap concept | GitHub primitive |
| --- | --- |
| The milestone (`M-1`) | A native GitHub **milestone**, for the progress bar |
| The milestone's narrative (vision, north star, streams table, open questions, parked items) | A **tracking issue** with a checklist — milestones can't render this, so a dedicated issue carries it |
| Each roadmap item (F-NN / S-NN) | One **issue**, body = the item's full roadmap entry |
| `Type: Foundation` / `Type: Slice` | `type:foundation` / `type:slice` labels |
| `Stream: A/B/C/D` | `stream:a` / `stream:b` / `stream:c` / `stream:d` labels |
| `Status: ready` / `proposed` | `roadmap-status:ready` / `roadmap-status:proposed` labels |
| `Prerequisites` / `Blockers` | GitHub's native issue blocking relationships, plus restated in the issue body |
| Provenance | `roadmap` label + a footer line on every issue noting it was migrated from `roadmap.md` |

Each roadmap-item issue body keeps the same fields the roadmap entry has: Roadmap ID, Change ID
(the folder name `/10x-new` will create later), Type, Outcome, PRD refs, Prerequisites/
Blockers/Parallel-with, Unknowns (with owner + whether they block), Risk, Roadmap status, and
Ready-for-`/10x-plan`.

## 3. What was migrated

- **1 milestone**: `M-1: First AI-generated study loop` — groups all 5 roadmap items.
- **1 tracking issue** ([#6](https://github.com/devtencodes/10x-cards/issues/6)) — mirrors the
  milestone with the full narrative (vision, north star, streams table, open questions, parked
  items) and a checklist of #1–#5. Closing #1–#5 is what "done" means for #6.
- **5 roadmap-item issues** ([#1](https://github.com/devtencodes/10x-cards/issues/1)–[#5](https://github.com/devtencodes/10x-cards/issues/5)),
  one per row in the roadmap's "At a glance" table:

| Issue | Roadmap ID | Title | Type | Stream | Status |
| --- | --- | --- | --- | --- | --- |
| [#1](https://github.com/devtencodes/10x-cards/issues/1) | F-01 | Add flashcards + review-schedule schema with per-user RLS | foundation | A — Data foundation + AI core | `ready` |
| [#2](https://github.com/devtencodes/10x-cards/issues/2) | S-01 | Email/password sign-up and login | slice | D — Auth | `ready` (already implemented, needs smoke test) |
| [#3](https://github.com/devtencodes/10x-cards/issues/3) | S-02 | AI-generate, review, and save flashcards from pasted text | slice, **north star** | A | `proposed` (blocked on #1, #2, OpenRouter secret) |
| [#4](https://github.com/devtencodes/10x-cards/issues/4) | S-03 | View, edit, and delete saved flashcards | slice | B — Flashcard lifecycle | `proposed` (blocked on #3) |
| [#5](https://github.com/devtencodes/10x-cards/issues/5) | S-04 | Study due flashcards with spaced repetition | slice | C — Study loop | `proposed` (blocked on #3) |

Dependency chain: **#1 → #2** (parallel) **→ #3** (north star) **→ #4, #5** (parallel).

Labels created for this: `roadmap`, `type:foundation`, `type:slice`, `stream:a`–`stream:d`,
`roadmap-status:ready`, `roadmap-status:proposed`.

Open items that came along for the ride but were **not** turned into separate issues (recorded
on #6 instead, exactly as `roadmap.md` has them):

- Duplicate-card checking on save — deferred, revisit if it becomes a nuisance.
- Search/filter on the flashcard list — deferred to v1.1.
- Success-criterion replacement for the "75% AI-created" metric now that manual creation is
  deferred — unresolved, owner: user.
- `prd.md` frontmatter still says `hard_deadline: 2026-09-08`; the roadmap session recorded a
  user correction to **2026-09-10** that hasn't been written back to the PRD yet.

## How to work this going forward

- Treat GitHub Issues as the live tracker for day-to-day status; treat `roadmap.md` as the
  document you actually edit when scope, sequencing, or intent changes — then re-run
  `/10x-roadmap` (or hand-edit both) to bring GitHub back in sync.
- When a roadmap item is picked up for implementation, `/10x-new` creates its
  `context/changes/<change-id>/` folder using the `Change ID` already recorded in the issue body
  (e.g. `flashcard-data-foundation` for #1).
- Close #1–#5 as their slices ship; close #6 once all five are closed and the milestone is done.

## Related mirror

This same content has also been mirrored into Linear (project **M-1: First AI-generated study
loop**, team Devtencodes) as a second, independent view of the same roadmap items — see the
Linear project for its own issue IDs and links back to these GitHub issues.
