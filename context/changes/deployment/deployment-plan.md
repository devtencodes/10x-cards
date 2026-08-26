# Cloudflare Workers Integration & Deployment — 10x-cards

## Context

`context/foundation/infrastructure.md` already recommends and accepts Cloudflare Workers as the deployment platform (Vercel was runner-up). The project already has `@astrojs/cloudflare@13.5.0` wired into `astro.config.mjs` and a populated `wrangler.jsonc` — the bootstrapper got the adapter right, but nothing has ever actually been deployed, there is no production auto-deploy configured, and one load-bearing assumption (that `astro:env/server` correctly resolves Cloudflare Workers Secrets at runtime) has never been verified against a real deploy.

This plan turns "infrastructure.md's recommendation" into a working, auto-deploying production setup, while treating several real, currently-open risks as things to *verify*, not assume:

1. **Env/secrets access API drift** (flagged in `infrastructure.md`'s own risk register) — confirmed via live research: GitHub issue [`withastro/astro#16790`](https://github.com/withastro/astro/issues/16790) shows the Cloudflare adapter had a real bug forwarding `wrangler.jsonc` `vars` to `astro:env`, fixed by PR #17275 (merged July 7, 2026), landing in `@astrojs/cloudflare@14.1.2+`. This project is on `13.5.0` (predates the fix). **Upgrading is not the right fix here**: v14 requires Astro `^7.2.0` as a peer (confirmed via `npm view`), forcing an unrelated major-version jump (different `imageService` default, changed cache-provider API) — out of scope for a deploy task. Additionally, this project's secrets never flow through `wrangler.jsonc`'s `vars` key (the actual site of that bug) — they go through `wrangler secret put` (prod) and `.dev.vars` (local), a different path. **Decision: stay on `13.5.0`/Astro `6.3.1`, but verify the different path empirically** (Phase 3) rather than assume it's unaffected, and have a documented one-line fallback (`import { env } from "cloudflare:workers"`) ready if it isn't.
2. **A real, pre-existing CI bug**: `.github/workflows/ci.yml` triggers on `branches: [master]`, but the repo's actual default (and only) branch is `main`. This lint/build CI job currently never fires on real pushes — fix regardless of the deploy work below.
3. **Untested rollback**: `infrastructure.md`'s own pre-mortem predicts "rollback was never tested until an incident." Phase 7 turns that prediction into a rehearsed, known-working procedure before it's ever load-bearing.

**Deploy trigger model (per explicit request)**: first production deploy is **manual** (CLI, Phase 3/5). All deploys after that are **auto-triggered on push to the production branch, handled natively by Cloudflare** — not GitHub Actions. GitHub Actions (`.github/workflows/ci.yml`) stays scoped to lint + build only, as a PR quality gate; it never runs `wrangler deploy`. This is done via **Cloudflare Workers Builds** — Cloudflare's own Git integration (Dashboard → Worker → Settings → Builds → Connect), which `infrastructure.md`'s own Operational Story section already anticipated ("automatically per-PR if Cloudflare's GitHub integration/Workers Builds is connected to the repo"). Confirmed via live research: Workers Builds connects an existing Worker to a GitHub/GitLab repo, builds+deploys on every push to a configurable **production branch**, and is dashboard-only to set up today (no CLI/API path exists yet for the Git-connect step itself — [tracked feature request](https://github.com/cloudflare/workers-sdk/issues/12058)).

> **Two flagged interpretations — correct if wrong:**
> - "Push to master" is read as **push to `main`** (the repo's actual and only branch; there is no `master` branch to point production at). If a genuinely separate `master` branch is wanted as a distinct production branch from `main`, say so and this plan's Prerequisites/Phase 6 need a branch-strategy addendum.
> - Dev and prod are read as **sharing one cloud Supabase project** (per earlier confirmation), so the Prerequisites section below skips the README's default local-Docker-Supabase flow (`npx supabase init && supabase start`) in favor of one hosted project used everywhere. The repo already has a `supabase/config.toml` from a prior `npx supabase init` — it's simply unused under this model, not a conflict.

**Verified-already-fine, no action needed**: `wrangler@4.126.0` is current latest (released yesterday). `.nvmrc` already pins `22.14.0`, consistent with CI's `node-version: 22`. `.gitignore` already correctly excludes `.dev.vars`, `.wrangler/`, `.env*`, `dist/`.

---

## Prerequisites — CLI & Supabase configuration

*Do this before Phase 0. Mostly human-only (account/credential creation); a few steps are agent-runnable once credentials exist.*

### A. Wrangler CLI ✅ done

- [x] Confirm Wrangler is available: `npx wrangler --version` → expect `4.126.0` (already a devDependency, no install needed)
- [x] Human: authenticate interactively — `npx wrangler login` (opens a browser OAuth flow)
  - [ ] Edge case: if OAuth fails in a headless/sandboxed/CI-less environment, use a scoped API token instead — set `CLOUDFLARE_API_TOKEN` as a local env var and skip `wrangler login`; every `wrangler` command picks it up automatically
- [x] Confirm auth works: `npx wrangler whoami` (should print the account email/ID, not an error)
- [ ] Confirm Node version matches the pinned `.nvmrc`: `nvm use` (installs/switches to `22.14.0` if `nvm` is present; install `nvm` first if missing)

### B. Supabase (one cloud project, shared by dev and prod) — project created ✅

- [x] Human: create a Supabase project at [supabase.com](https://supabase.com/dashboard) (organization → New project → name, region, DB password) and wait ~2 minutes for provisioning
- [x] Human: copy the **Project URL** and **`anon` public key** from Dashboard → Settings → API
- [ ] Agent: `cp .env.example .env` and `cp .env.example .dev.vars` (`.dev.vars` doesn't exist yet — create it directly), then fill both with the same values:
  ```
  SUPABASE_URL=https://<project-ref>.supabase.co
  SUPABASE_KEY=<anon-key>
  ```
- [ ] Skip the README's local-Docker-Supabase flow (`npx supabase init`/`supabase start`) — not needed when dev and prod share one hosted project; the existing committed `supabase/config.toml` (from a prior `npx supabase init`) stays unused
- [ ] Human decision, not a default: the README documents toggling **Authentication → Email → Confirm email** off for local-dev convenience. Because dev and prod share one project, this toggle is global — leave it **ON** unless the product genuinely wants unverified sign-ins in production too
- [ ] Verify: `npm run dev`, confirm the "Supabase not configured" banner (`src/lib/config-status.ts`) is absent, then exercise sign-up/sign-in once against the real project

### C. GitHub repository ✅ done

- [x] Repo already exists and is connected: `git@github.com:devtencodes/10x-cards.git` (origin), default branch `main` — needed later for Phase 6's Workers Builds Git integration

---

## Phase 0 — Pre-flight decisions & housekeeping

- [ ] Rename Worker + package: `wrangler.jsonc`'s `"name"` and `package.json`'s `"name"` → `10x-cards`
- [ ] Fix the CI branch mismatch: `.github/workflows/ci.yml` triggers (`push`/`pull_request`) → `branches: [main]` (currently `[master]`, which never fires against this repo's actual default branch) — this workflow remains **lint + build only**, it must never gain a deploy step (see Context)
- [ ] Decide `compatibility_date` in `wrangler.jsonc`: bump from `2026-05-08` to today (`2026-08-26`) — recommended, since nothing has deployed yet so there's no behavior-pinning reason to stay stale
- [ ] Commit the two changes already sitting uncommitted in the working tree as part of this phase's housekeeping commit:
  - `package.json` / `package-lock.json` — `wrangler` bumped `^4.90.0` → `^4.126.0`
  - `context/foundation/infrastructure.md` — currently untracked
- [ ] Edge case: since the Cloudflare account is brand new, no name-collision check is needed — skip straight to renaming

## Phase 1 — Local secrets setup (agent-runnable)

- [ ] Confirmed already done in Prerequisites B (`.dev.vars` created and populated) — no separate action here, just re-verify `npm run dev` shows no config-status banner before moving on
- [ ] Edge case: if the banner still shows after adding `.dev.vars`, run `npx astro sync` first (regenerates the typed `astro:env` module) before assuming it's a real bug

## Phase 2 — Human-only account & access setup

- [x] Human creates/confirms Cloudflare account access (done — see Prerequisites A/C)
- [ ] Human creates a **scoped** API token: Workers Scripts edit permission limited to the `10x-cards` Worker only — no account-wide access, no DNS, no billing (per this project's CLAUDE.md production-access posture: scoped tokens, not master keys). This token is for **local/agent CLI use** (`wrangler deploy`/`secret put`/`rollback`/`tail`) — it is **not** used by GitHub Actions, since production auto-deploy is handled by Cloudflare's own Workers Builds integration (Phase 6), not GHA
  - [ ] Edge case: sanity-check the token with a harmless read-only command first (e.g. `wrangler whoami` or `wrangler deployments list` using the token) — a wrong-scope token fails with a specific, greppable permission error; seeing that error now makes it recognizable later if a deploy fails for the same reason
- [ ] Edge case: if `wrangler login` OAuth fails in a headless/sandboxed environment, fall back to the same scoped API token locally too (`CLOUDFLARE_API_TOKEN` env var + `wrangler deploy`) — no separate mechanism needed

## Phase 3 — Runtime env-access verification (risk-mitigation gate)

*This phase exists specifically to convert the "does `astro:env/server` actually see Workers Secrets in production" assumption into a verified fact — see Context above.*

- [ ] Provision the first real Workers Secrets: `wrangler secret put SUPABASE_URL`, `wrangler secret put SUPABASE_KEY` (same values as `.dev.vars`, since dev and prod share one Supabase project)
- [ ] Deploy manually: `npm run build && npx wrangler deploy`
- [ ] Hit the deployed `*.workers.dev` URL and confirm the config-status banner is **absent** (proves `astro:env/server` resolved the secret at runtime, not just that it works locally)
- [ ] Attempt a real sign-in against production Supabase to confirm the full server-side client construction path works end-to-end, not just that the env strings are non-empty
- [ ] **If verification fails** (banner still shows, or a runtime error indicates the vars are undefined): switch `src/lib/supabase.ts` and `src/lib/config-status.ts` from `import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server"` to `import { env } from "cloudflare:workers"` (the adapter's current documented fallback), redeploy, and re-verify
- [ ] Record which path worked in Phase 8's docs hand-off — this closes the "env/secrets access pattern changed" row in `infrastructure.md`'s risk register with an empirical answer instead of a guess

## Phase 4 — Production secrets: already done in Phase 3

- [ ] Confirm no further action needed here — Phase 3 already provisioned the real production secrets as part of verification. This phase is a placeholder for the future: document (do not execute) the pending step `wrangler secret put OPENROUTER_API_KEY`, to be run when AI-generation (PRD FR-004) actually ships
- [ ] Note for later: once secrets exist, rotating them (`wrangler secret put <NAME>` again) is agent-runnable, not human-only

## Phase 5 — First production deploy: confirm end-to-end

*(Largely covered by Phase 3's deploy — this phase is the final sign-off pass on the manual first deploy, before auto-deploy is wired up in Phase 6.)*

- [ ] Re-confirm the `*.workers.dev` URL loads correctly and the config-status banner is absent
- [ ] Verify auth flow end-to-end: sign up, sign in, sign out against real Supabase
- [ ] Edge case: if a `workerd`-specific runtime error appears that doesn't reproduce under plain `astro dev`, retest under `wrangler dev` (real `workerd`) before assuming it's an application bug — this is the documented `nodejs_compat` polyfill-gap risk from `infrastructure.md`
- [ ] Edge case: monitor CPU-ms via `wrangler tail` or the dashboard if any request feels slow to respond — free tier is billed on active CPU time, not wall-clock, so a "waiting on Supabase" request is nearly free but heavy JSON/template work is not

## Phase 6 — Production auto-deploy via Cloudflare Workers Builds (not GitHub Actions)

*Requires Phase 5 complete — Workers Builds connects to an existing Worker, so the manual first deploy must exist already.*

- [ ] Human: Cloudflare Dashboard → Workers & Pages → `10x-cards` → **Settings → Builds → Connect**
- [ ] Human: authorize Cloudflare's GitHub App for the `devtencodes/10x-cards` repository (OAuth grant — human-only, can't be scripted or done via CLI/API today)
- [ ] Set **production branch** = `main` (per the flagged interpretation in Context — revisit if a distinct `master` branch is actually wanted)
- [ ] Set **Build command** = `npm run build`; leave **Deploy command** at its default `npx wrangler deploy`
- [ ] Leave "non-production branch builds" (PR preview deploys) **off** for now — no stated requirement for preview URLs; note it as an easy opt-in later if wanted
- [ ] Edge case: Workers Builds' build step runs in an environment isolated from the Worker's runtime — if `npm run build` fails or misbehaves without `SUPABASE_URL`/`SUPABASE_KEY` present, add them under the **build's own** "Variables and secrets" (Settings → Builds), which is a *separate* surface from the Worker's runtime secrets set via `wrangler secret put` in Phase 3. Try without first — the astro:env schema marks both as `optional: true`, so the build likely succeeds either way
- [ ] Push a trivial commit to `main` and confirm in the dashboard (Workers & Pages → `10x-cards` → Deployments) that an automatic build + deploy ran, and that GitHub shows a commit status/check for it
- [ ] Confirm `.github/workflows/ci.yml` did **not** perform any deploy step — it only ran lint + build as a separate, parallel PR gate; Cloudflare's Git integration owns production deploys end-to-end

## Phase 7 — Rollback rehearsal

*(Directly addresses `infrastructure.md`'s pre-mortem: "rollback was never tested until an actual incident.")*

- [ ] Ship one trivial, reversible change (e.g. a copy tweak) by pushing to `main` (now auto-deployed via Workers Builds, Phase 6)
- [ ] Run `wrangler rollback [deployment-id]` and confirm the previous version is restored
- [ ] Run `wrangler tail` briefly to confirm live log streaming works post-rollback
- [ ] Document the caveat already in the risk register: `wrangler rollback` reverts code/config only, not Supabase schema state — any deploy that bundles a migration is not safely one-command-reversible

## Phase 8 — Documentation hand-off

- [ ] Write `context/deployment/deploy-plan.md` capturing what was actually done: final Worker/package name, `compatibility_date`, secrets provisioned, which env-access pattern worked (Phase 3's outcome), the Workers Builds Git-integration configuration (production branch, build/deploy commands), rollback rehearsal result
- [ ] Update `context/foundation/tech-stack.md`'s stale hint: `deployment_target: cloudflare-pages` → `cloudflare-workers`
- [ ] Note (don't necessarily act on): Cloudflare's free-tier request cap resets **daily**, not monthly — worth a one-line callout in the deploy-plan doc in case traffic ever becomes bursty
- [ ] Commit everything from this phase together with (or as a follow-up to) Phase 0's housekeeping commit

---

## Verification

- Prerequisites: `wrangler whoami` succeeds; `npm run dev` shows no config-status banner against the real Supabase project
- Local: `npm run dev` shows no config-status banner (Phase 1)
- Production (manual first deploy): deployed URL loads, banner absent, real sign-up/sign-in/sign-out succeeds against Supabase (Phases 3, 5)
- Auto-deploy: a push to `main` produces an automatic Cloudflare build+deploy visible in the dashboard, with **no** GitHub Actions job performing the deploy (Phase 6)
- Rollback: `wrangler rollback` demonstrably restores a prior version, and `wrangler tail` streams logs afterward (Phase 7)
- Docs: `context/deployment/deploy-plan.md` exists and accurately reflects what was deployed; `tech-stack.md`'s stale hint is corrected (Phase 8)

## Explicitly out of scope

Docker/Dockerfile setup, multi-region/HA architecture, implementing the OpenRouter AI-generation feature itself (only its secret-provisioning slot is documented), re-running upstream `/10x-*` skills (nothing upstream is broken), PR preview deploys (Workers Builds non-production-branch builds left off by default).
