# Cloudflare Workers Integration & Deployment — 10x-cards

## Context

`context/foundation/infrastructure.md` already recommends and accepts Cloudflare Workers as the deployment platform (Vercel was runner-up). The project already has `@astrojs/cloudflare@13.5.0` wired into `astro.config.mjs` and a populated `wrangler.jsonc` — the bootstrapper got the adapter right, but nothing has ever actually been deployed, there is no production auto-deploy configured, and one load-bearing assumption (that `astro:env/server` correctly resolves Cloudflare Workers Secrets at runtime) has never been verified against a real deploy.

This plan turns "infrastructure.md's recommendation" into a working, auto-deploying production setup, while treating several real, currently-open risks as things to *verify*, not assume:

1. **Env/secrets access API drift** (flagged in `infrastructure.md`'s own risk register) — confirmed via live research: GitHub issue [`withastro/astro#16790`](https://github.com/withastro/astro/issues/16790) shows the Cloudflare adapter had a real bug forwarding `wrangler.jsonc` `vars` to `astro:env`, fixed by PR #17275 (merged July 7, 2026), landing in `@astrojs/cloudflare@14.1.2+`. This project is on `13.5.0` (predates the fix). **Upgrading is not the right fix here**: v14 requires Astro `^7.2.0` as a peer (confirmed via `npm view`), forcing an unrelated major-version jump (different `imageService` default, changed cache-provider API) — out of scope for a deploy task. Additionally, this project's secrets never flow through `wrangler.jsonc`'s `vars` key (the actual site of that bug) — they go through `wrangler secret put` (prod) and `.dev.vars` (local), a different path. **Decision: stay on `13.5.0`/Astro `6.3.1`, but verify the different path empirically** (Phase 3) rather than assume it's unaffected, and have a documented one-line fallback (`import { env } from "cloudflare:workers"`) ready if it isn't.
2. **A real, pre-existing CI bug**: `.github/workflows/ci.yml` triggers on `branches: [master]`, but the repo's actual default (and only) branch is `main`. This lint/build CI job currently never fires on real pushes — fix regardless of the deploy work below.
3. **Untested rollback**: `infrastructure.md`'s own pre-mortem predicts "rollback was never tested until an incident." Phase 7 turns that prediction into a rehearsed, known-working procedure before it's ever load-bearing.

**Deploy trigger model (per explicit request)**: first production deploy is **manual** (CLI, Phase 3/5). All deploys after that are **auto-triggered on push to the production branch, handled natively by Cloudflare** — not GitHub Actions. GitHub Actions (`.github/workflows/ci.yml`) stays scoped to lint + build only, as a PR quality gate; it never runs `wrangler deploy`. This is done via **Cloudflare Workers Builds** — Cloudflare's own Git integration (Dashboard → Worker → Settings → Builds → Connect), which `infrastructure.md`'s own Operational Story section already anticipated ("automatically per-PR if Cloudflare's GitHub integration/Workers Builds is connected to the repo"). Confirmed via live research: Workers Builds connects an existing Worker to a GitHub/GitLab repo, builds+deploys on every push to a configurable **production branch**, and is dashboard-only to set up today (no CLI/API path exists yet for the Git-connect step itself — [tracked feature request](https://github.com/cloudflare/workers-sdk/issues/12058)).

> **Flagged interpretation — correct if wrong:**
> - "Push to master" is read as **push to `main`** (the repo's actual and only branch; there is no `master` branch to point production at). If a genuinely separate `master` branch is wanted as a distinct production branch from `main`, say so and this plan's Prerequisites/Phase 6 need a branch-strategy addendum.

**Supabase model (superseded, corrected 2026-08-26)**: the original plan assumed one cloud Supabase project shared by dev and prod. In practice, `.env` was populated with the **local Supabase CLI/Docker stack** (`SUPABASE_URL=http://127.0.0.1:54321`, confirmed running via `npx supabase status`, publishable key matches). Confirmed decision: **local Docker Supabase for day-to-day dev, a separate cloud project for production.** `.env`/`.dev.vars` hold the local stack's values; the cloud project's own URL/anon key are used only for the Phase 3 production Workers Secrets. The repo's committed `supabase/config.toml` is therefore active and in use, not a leftover.

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

### B. Supabase — local Docker stack for dev ✅, separate cloud project for prod

- [x] Local stack running: `npx supabase status` confirms `Project URL: http://127.0.0.1:54321`, publishable key matches `.env`
- [x] `.env` populated with local stack values (`SUPABASE_URL=http://127.0.0.1:54321`, `SUPABASE_KEY=sb_publishable_...`)
- [ ] Create `.dev.vars` mirroring `.env` (same local values) — `.dev.vars` doesn't exist yet; needed for `wrangler dev`/Workers-runtime-accurate local testing
- [ ] Human: create/confirm a **separate cloud** Supabase project at [supabase.com](https://supabase.com/dashboard) for production (organization → New project → name, region, DB password)
- [ ] Human: copy the cloud project's **Project URL** and **`anon` public key** from Dashboard → Settings → API — these feed **only** Phase 3's production Workers Secrets, never `.env`/`.dev.vars`
- [ ] Human decision, not a default: the README documents toggling **Authentication → Email → Confirm email** off for local-dev convenience. Since dev and prod are now separate projects, this can safely be toggled off on the **local** project only, without affecting production
- [x] Verify: `npm run dev`, confirm the "Supabase not configured" banner (`src/lib/config-status.ts`) is absent, then exercise sign-up/sign-in once against the local stack — done in Phase 1

### C. GitHub repository ✅ done

- [x] Repo already exists and is connected: `git@github.com:devtencodes/10x-cards.git` (origin), default branch `main` — needed later for Phase 6's Workers Builds Git integration

---

## Phase 0 — Pre-flight decisions & housekeeping ✅ done (commit `fc3adb8`)

- [x] Rename Worker + package: `wrangler.jsonc`'s `"name"` and `package.json`'s `"name"` → `10x-cards`
- [x] Fix the CI branch mismatch: `.github/workflows/ci.yml` triggers (`push`/`pull_request`) → `branches: [main]` (currently `[master]`, which never fires against this repo's actual default branch) — this workflow remains **lint + build only**, it must never gain a deploy step (see Context)
- [x] Decide `compatibility_date` in `wrangler.jsonc`: attempted bumping from `2026-05-08` to today (`2026-08-26`), but **reverted back to `2026-05-08`** in Phase 1 after discovering it breaks local dev (see Phase 1's edge case) — `@astrojs/cloudflare@13.5.0`'s bundled Vite plugin caps local Miniflare emulation at compat date `2026-05-14`, regardless of the standalone `wrangler` CLI's own newer version. Staying on the original date is correct until the adapter is upgraded
- [x] Commit the two changes already sitting uncommitted in the working tree as part of this phase's housekeeping commit:
  - `package.json` / `package-lock.json` — `wrangler` bumped `^4.90.0` → `^4.126.0`
  - `context/foundation/infrastructure.md` — currently untracked
- [x] Edge case: since the Cloudflare account is brand new, no name-collision check is needed — skip straight to renaming

## Phase 1 — Local secrets setup (agent-runnable) ✅ done

- [x] `.dev.vars` created, mirroring `.env` (local Supabase stack values); trailing-whitespace bug fixed in both files
- [x] `npx astro sync` succeeds, picks up `.dev.vars`
- [x] `npm run dev` starts clean, homepage returns HTTP 200, config-status banner confirmed **absent**
- [x] Edge case discovered and fixed: `compatibility_date: 2026-08-26` (Phase 0's bump) broke local dev entirely — `@astrojs/cloudflare@13.5.0`'s bundled Vite plugin pins its own older `workerd` (capped at compat date `2026-05-14`), separate from the standalone `wrangler` CLI's newer nested copy (confirmed via `npm view wrangler@4.126.0 dependencies`: workerd `1.20260825.1`, vs. the adapter's hoisted `1.20260507.1`). Reverted `compatibility_date` to `2026-05-08` in `wrangler.jsonc`. **This caps compatibility_date for local dev until `@astrojs/cloudflare` is upgraded** — worth a callout in Phase 8's docs
- [x] Sign-up/sign-in round-trip verified against the local Supabase stack: `POST /api/auth/signup` → `302` to `/auth/confirm-email`; `POST /api/auth/signin` → `302` to `/` with a valid `sb-127-auth-token` session cookie decoding to a real authenticated user (`email_confirmed_at` set — consistent with `enable_confirmations = false` in `supabase/config.toml`). Full auth path confirmed working end-to-end, not just non-empty env vars
- [x] Edge case hit and resolved along the way: curl requests without an `Origin` header matching the dev server got a `403 "Cross-site POST form submissions are forbidden"` — this is Astro's own built-in CSRF protection working as intended, not an app or Supabase bug; adding `-H "Origin: http://localhost:4321"` resolved it

## Phase 2 — Human-only account & access setup ✅ account confirmed, token scoping deferred (accepted)

- [x] Human creates/confirms Cloudflare account access — confirmed via `npx wrangler whoami`: active OAuth login (`devtencodes@gmail.com`'s Account, ID `d8a9b6e71ca7f5f225beec54c22ffd3e`)
- [ ] ~~Human creates a **scoped** API token~~ — **deferred by explicit user decision.** This project's CLAUDE.md calls for scoped tokens (Workers Scripts edit on `10x-cards` only, no account-wide/DNS/billing) for agent-run commands, not the broad OAuth session (which currently carries wide account scope: KV, D1, Pages, AI, containers, etc.). User chose to proceed with the existing OAuth login for speed instead. **Recorded as an accepted deviation, not an oversight** — revisit before granting any agent-driven access to something more sensitive than Workers deploy/secrets
- [ ] Edge case (now moot given the above): if `wrangler login` OAuth fails in a headless/sandboxed environment, fall back to a scoped API token locally (`CLOUDFLARE_API_TOKEN` env var + `wrangler deploy`)

## Phase 3 — Runtime env-access verification (risk-mitigation gate) ✅ done

*This phase exists specifically to convert the "does `astro:env/server` actually see Workers Secrets in production" assumption into a verified fact — see Context above.*

- [x] Provision the first real Workers Secrets: `SUPABASE_URL`/`SUPABASE_KEY` added via the Cloudflare dashboard (user-provisioned directly, not via `wrangler secret put`) — confirmed present via `npx wrangler secret list`
- [x] Deploy manually: `npm run build && npx wrangler deploy` → `https://10x-cards.devtencodes.workers.dev`. Deploy auto-provisioned two bindings not previously in `wrangler.jsonc`: a `SESSION` KV Namespace and an `IMAGES` binding — both are `@astrojs/cloudflare@13.5.0` defaults (session storage + image processing), not something this plan requested; flagged for Phase 8 docs, not a problem but worth knowing they now exist as live account resources
- [x] Hit the deployed URL — **first attempt returned HTTP 500**: `wrangler tail` showed `Error: Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.` The config-status banner was absent even on this failing request, proving `astro:env/server` **did** resolve a truthy secret value — the failure was a bad/malformed value entered into the `SUPABASE_URL` secret itself (data-entry issue), not an env-access mechanism issue. User re-added the secrets via the dashboard; redeploy wasn't even needed — Cloudflare Secrets apply live to the running Worker. Re-check returned **HTTP 200**, banner absent
- [x] Real sign-up/sign-in against **production** Supabase confirms the full path works end-to-end:
  - First attempt used `@example.com` → production rejected it (`"Email address ... is invalid"`) — itself a good sign: proves the Worker is genuinely reaching real Supabase Auth and its validation, not a stub
  - Retried with a realistic domain → sign-up succeeded (302 → `/auth/confirm-email`), sign-in correctly returned `"Email not confirmed"` (production, unlike the local stack, requires email confirmation) — this is the expected, correct security posture for prod, and definitively proves the request chain (Worker → `astro:env/server` → real Supabase Auth API → real validation) is live and correct
  - **Manual cleanup needed**: a real (unconfirmed) test user was created in production `auth.users` — agent has only the anon key, no service-role key, so can't delete it via Admin API. **User needs to delete `cf-deploy-verify-1787750632@gmail.com` via Supabase Dashboard → Authentication → Users**
- [x] Verification succeeded on the **first mechanism** — `astro:env/server` correctly resolves Cloudflare Workers Secrets at runtime. **No fallback to `import { env } from "cloudflare:workers"` was needed.** This closes the "env/secrets access pattern changed" row in `infrastructure.md`'s risk register with a definitive empirical answer: the mechanism works as documented on `@astrojs/cloudflare@13.5.0`; the earlier 500 was a secret-value data-entry mistake, not an API/adapter bug

## Phase 4 — Production secrets: already done in Phase 3 ✅

- [x] Confirmed — Phase 3 already provisioned the real production secrets. Still pending, for the future: document (do not execute) `wrangler secret put OPENROUTER_API_KEY`, to be run when AI-generation (PRD FR-004) actually ships
- [ ] Note for later: once secrets exist, rotating them (`wrangler secret put <NAME>` again) is agent-runnable, not human-only

## Phase 5 — First production deploy: confirm end-to-end ✅ done (folded into Phase 3)

- [x] Re-confirmed the `*.workers.dev` URL loads correctly (HTTP 200) and the config-status banner is absent
- [x] Verified auth flow end-to-end: sign up (302 → confirm-email) and sign in (correctly gated on email confirmation) against real production Supabase — see Phase 3 for full detail
- [ ] Sign-out not yet explicitly tested (low risk — same `createClient()` path already proven working for signin/signup)
- [ ] Edge case (not hit, no action needed): if a `workerd`-specific runtime error appears that doesn't reproduce under plain `astro dev`, retest under `wrangler dev` before assuming it's an application bug — this is the documented `nodejs_compat` polyfill-gap risk from `infrastructure.md`
- [ ] Edge case (not hit, no action needed): monitor CPU-ms via `wrangler tail`/dashboard if any request feels slow — free tier bills active CPU time, not wall-clock

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
