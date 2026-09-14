# 10xCards

Turn pasted text into study-ready flashcards with AI, then review them with spaced repetition — without the tedium of writing every card by hand.

Built as the capstone project for [10xDevs](https://10xdevs.pl/), an AI-assisted software engineering course.

## The problem

Spaced repetition is a well-proven way to retain what you learn, but manually authoring flashcards is enough friction that most self-directed learners never sustain the habit. 10xCards removes that friction: paste the material you just read, let an LLM extract the key facts as question-answer pairs, review and keep the ones worth studying, and let a spaced-repetition schedule tell you when to revisit them.

## How it works

1. **Paste source text** (100–10,000 characters) — an article, your own notes, a chapter, anything.
2. **Generate candidates** — an LLM extracts up to ~20 distinct facts as question/answer pairs.
3. **Review** — accept, edit, or reject each candidate individually, or accept all at once. Rejected candidates are discarded immediately, nothing is silently kept.
4. **Study** — accepted cards enter a spaced-repetition queue. Each session surfaces the cards due today; rate your recall as remembered or forgotten and the next review date is rescheduled accordingly.

Saved cards can also be browsed, edited (which resets that card's schedule to "new"), and deleted at any time.

## AI-native development

This project was built AI-native, not just "with AI help" — [Claude Code](https://claude.com/claude-code) was used throughout the full lifecycle, not only to write code:

- **Product definition:** a PRD (`context/foundation/prd.md`) drives every decision — user stories, functional/non-functional requirements, and explicit non-goals — including a Socratic pass that logged and resolved counter-arguments to each requirement before it was accepted.
- **Planning:** the PRD is decomposed into a dependency-ordered roadmap (`context/foundation/roadmap.md`) of foundations and slices, each traced back to its source requirement.
- **Implementation:** every slice is planned, implemented, and reviewed as its own unit of work under `context/changes/`, then archived to `context/archive/` on completion with its plan, decisions, and review kept alongside the code.
- **Testing:** end-to-end tests (`tests/e2e/`) were generated and reviewed against a fixed set of anti-patterns (flaky waits, brittle selectors, non-independent tests) rather than hand-written from scratch.

The full audit trail — requirements, plans, review notes, and lessons learned per slice — lives in `context/` alongside the code, so every shipped feature traces back to the requirement that motivated it.

## Tech stack

- [Astro](https://astro.build/) v6 — server-first web framework, page/API routing
- [React](https://react.dev/) v19 — interactive UI islands (review flow, study session)
- [TypeScript](https://www.typescriptlang.org/) v5 — end to end
- [Tailwind CSS](https://tailwindcss.com/) v4 — styling
- [Supabase](https://supabase.com/) — Postgres database, Auth (email/password), and row-level security for per-user data isolation
- [OpenRouter](https://openrouter.ai/) — LLM provider for flashcard generation
- [Cloudflare Workers](https://workers.cloudflare.com/) — edge hosting/deployment
- [Playwright](https://playwright.dev/) — end-to-end tests

## Prerequisites

- Node.js v22.14.0 (see `.nvmrc`)
- npm (comes with Node.js)
- [Docker](https://www.docker.com/) — for running Supabase locally (~7 GB RAM)
- An [OpenRouter](https://openrouter.ai/) API key — for AI flashcard generation

## Getting started

1. Clone the repository and install dependencies:

```bash
git clone https://github.com/devtencodes/10x-cards.git
cd 10x-cards
npm install
```

2. Set up Supabase (local or cloud) — see [Supabase configuration](#supabase-configuration) below.

3. Create your environment files:

```bash
cp .env.example .env
cp .env.example .dev.vars
```

Fill in `SUPABASE_URL`, `SUPABASE_KEY`, and `OPENROUTER_API_KEY` in both files (see table below).

4. Apply database migrations against your Supabase instance:

```bash
npx supabase db push
```

5. Run the development server:

```bash
npm run dev
```

The app is available at `http://localhost:4321`.

### Environment variables

| Variable              | Description                                                              |
| ---------------------- | -------------------------------------------------------------------------- |
| `SUPABASE_URL`         | Supabase project URL                                                     |
| `SUPABASE_KEY`         | Supabase `anon` public key                                               |
| `OPENROUTER_API_KEY`   | API key for [OpenRouter](https://openrouter.ai/), used for AI generation |
| `OPENROUTER_MODEL`     | Model slug to use for generation (defaults to a free-tier model)         |

Variables are declared via Astro's `astro:env` schema and are server-only — never exposed to the client.

## Available scripts

- `npm run dev` — start the development server (Cloudflare `workerd` runtime)
- `npm run build` — build for production
- `npm run preview` — preview the production build
- `npm run lint` / `npm run lint:fix` — lint (and auto-fix) with ESLint
- `npm run format` — format with Prettier
- `npm run test:e2e` — run the Playwright end-to-end test suite

## Project structure

```md
.
├── src/
│ ├── layouts/            # Astro layouts
│ ├── pages/               # Astro pages
│ │ └── api/               # API endpoints (auth, flashcards, study)
│ ├── components/
│ │ ├── auth/               # Sign-up / sign-in forms
│ │ ├── flashcards/         # Generation, review, and management UI
│ │ ├── study/               # Spaced-repetition study session
│ │ ├── marketing/          # Landing page
│ │ └── ui/                  # Shared UI primitives
│ ├── db/                   # Supabase-generated types
│ ├── lib/                   # Server-side services (OpenRouter client, Supabase client, route guards)
│ └── middleware.ts         # Auth/session middleware, protected routes
├── supabase/
│ └── migrations/           # Database schema (flashcards, review schedule, RLS policies)
├── tests/e2e/               # Playwright end-to-end tests
├── public/                  # Static assets
└── wrangler.jsonc           # Cloudflare Workers config
```

## Supabase configuration

This project uses [Supabase](https://supabase.com/) for both the database (flashcards + review-schedule tables, scoped per user via row-level security) and email/password authentication.

### First-time setup (local, no cloud project needed)

Requires [Docker](https://www.docker.com/) and ~7 GB RAM.

1. Initialize the local Supabase project:

```bash
npx supabase init
```

2. Start the local stack (downloads Docker images on first run):

```bash
npx supabase start
```

3. Apply the committed migrations:

```bash
npx supabase db push
```

4. Copy the credentials printed by the CLI into your `.env` and `.dev.vars`:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key from CLI output>
```

5. To stop the stack when done:

```bash
npx supabase stop
```

The local Studio UI is available at `http://localhost:54323`.

### Using a cloud Supabase project instead

Add these to your `.env` and `.dev.vars`:

| Variable       | Description                                                |
| -------------- | ---------------------------------------------------------- |
| `SUPABASE_URL` | Project URL from Supabase dashboard → Settings → API       |
| `SUPABASE_KEY` | `anon` public key from Supabase dashboard → Settings → API |

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<anon-key>
```

Then push the migrations in `supabase/migrations/` to your project (via the dashboard SQL editor or `npx supabase db push --linked`).

### Email confirmation in local development

By default Supabase requires email confirmation before a user can sign in. To skip this locally, open the Supabase dashboard → **Authentication → Email → Confirm email** and toggle it off. Users can then sign in immediately after sign-up.

## Routes

| Route                 | Description                                        |
| --------------------- | --------------------------------------------------- |
| `/`                    | Landing page (redirects signed-in users to `/dashboard`) |
| `/auth/signup`        | Email/password sign-up                              |
| `/auth/signin`        | Email/password sign-in                              |
| `/auth/confirm-email` | Post-signup "check your inbox" page                 |
| `/dashboard`           | Overview — saved/due-card stats, entry points       |
| `/generate`            | Paste source text, generate and review AI candidates |
| `/flashcards`          | Browse, edit, and delete saved flashcards            |
| `/study`               | Study session for cards due today                    |

Route protection is handled in `src/middleware.ts` (`PROTECTED_ROUTES`).

## Testing

End-to-end tests run against a real dev server and local Supabase stack:

```bash
npx supabase start   # if not already running
npm run test:e2e
```

## Deployment

This project deploys to [Cloudflare Workers](https://workers.cloudflare.com/).

```bash
npm run build
npx wrangler deploy
```

Set `SUPABASE_URL`, `SUPABASE_KEY`, and `OPENROUTER_API_KEY` as secrets in the Cloudflare dashboard or via `npx wrangler secret put <NAME>`.

## CI

GitHub Actions runs lint + build on every push and PR to `master`. Configure `SUPABASE_URL` and `SUPABASE_KEY` as repository secrets for the build step.

## Project status

**v1 (MVP)** is complete: AI-generated flashcards from pasted text, full review flow (accept/edit/reject/bulk-accept), flashcard management (view/edit/delete), and spaced-repetition study sessions — all behind email/password auth with per-user data isolation.

Deliberately out of scope for v1 (see `context/foundation/prd.md`): manual flashcard creation, a custom spaced-repetition algorithm, multi-format import, cross-user sharing, third-party integrations, mobile apps, list search/filter, and duplicate detection.

## License

MIT
