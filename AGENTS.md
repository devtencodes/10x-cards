# Repository Guidelines

10x-cards is an Astro 6 SSR app (React 19 islands, Tailwind 4, Supabase auth, shadcn/ui) deployed to Cloudflare Workers.

## Hard Rules

- `CLAUDE.md` at the repo root documents the `/10x-*` agent-context skill chain (PRD → tech stack → bootstrap → onboarding) used to build and evolve this project — it is process guidance, not app architecture. `CLAUDE.md.scaffold` is the app-architecture reference; read `@CLAUDE.md.scaffold` for the full rundown.
- Use the `cn()` helper from `@/lib/utils` for conditional/merged Tailwind classes. Never concatenate class strings manually.
- No Next.js directives (`"use client"`, etc.) — this is Astro, not Next. React islands mount with `client:load` (see `SignInForm`/`SignUpForm` usage in `src/pages/auth/signin.astro:16` and `signup.astro:16`) — match that directive for new interactive components unless there's a reason to defer hydration.
- New Supabase tables require a migration in `supabase/migrations/` named `YYYYMMDDHHmmss_short_description.sql`, with RLS enabled and granular per-operation, per-role policies. None exist yet — `supabase/` currently holds only `config.toml`.

## Project Structure

`src/pages/` (Astro routes; `src/pages/api/` for API routes), `src/components/` (`ui/` = shadcn primitives, `auth/` = sign-in/up forms), `src/layouts/`, `src/lib/` (services/helpers, `supabase.ts` SSR client), `src/middleware.ts` (resolves the session, redirects unauthenticated users away from paths in `PROTECTED_ROUTES`). Path alias `@/*` → `./src/*` (`@tsconfig.json`). See `@README.md` for the Supabase local-setup walkthrough.

## Build, Test, and Development Commands

- `npm run dev` — start dev server (Cloudflare workerd runtime).
- `npm run build` — production build; `npm run preview` — preview it.
- `npm run lint` / `npm run lint:fix` — ESLint with type-checked rules (`@eslint.config.js`).
- `npm run format` — Prettier (astro + tailwind plugins, `@.prettierrc.json`).
- `npm run test:e2e` — Playwright e2e suite (`playwright.config.ts`, specs under `tests/e2e/`). Requires the local Supabase stack running (`npx supabase start`) — Playwright starts the dev server itself but not the database.

## Coding Style & Naming Conventions

- TypeScript strict mode (`@tsconfig.json`), enforced further by `typescript-eslint` strict + stylistic type-checked rules.
- shadcn/ui components (`"new-york"` style) live in `src/components/ui/`; add new ones with `npx shadcn@latest add [name]` rather than hand-writing primitives (`@components.json`).
- Husky + lint-staged run `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}` on every commit — do not bypass with `--no-verify`.

## Commit & Pull Request Guidelines

Only one commit exists so far ("bootstrap project") — no message convention is established yet. CI (`@.github/workflows/ci.yml`) runs `npm run lint` and `npm run build` on every push/PR to `master`; keep both green.

## Security & Configuration Tips

`SUPABASE_URL` / `SUPABASE_KEY` are declared as server-only secrets via `astro:env` in `@astro.config.mjs` — never expose them client-side. Local dev: copy `.env.example` to `.env` (Node) and `.dev.vars` (Cloudflare, gitignored). CI requires both as GitHub repository secrets.

## E2E Testing Rules

- Use getByRole, getByLabel, getByText as primary locators.
  Fall back to getByTestId only when accessibility attributes are ambiguous.
- Never use CSS selectors, XPath, or DOM structure for locating elements.
- Each test must be independently runnable — no shared state between tests.
- Never use page.waitForTimeout(). Wait for specific conditions:
  toBeVisible(), waitForURL(), waitForResponse().
- Assert the business outcome, not implementation details.
- Use unique identifiers (e.g., timestamp suffix) for test data
  to avoid collisions in parallel runs. Clean up in afterEach.
- Use storageState for authentication — never log in through UI
  in individual tests.
