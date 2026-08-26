---
project: 10x-cards
platform: Cloudflare Workers
worker_name: 10x-cards
deployed_url: https://10x-cards.devtencodes.workers.dev
deployed_at: 2026-08-26
compatibility_date: "2026-05-08"
production_branch: main
ci_provider: github-actions
deploy_provider: cloudflare-workers-builds
---

## What's deployed

**Platform**: Cloudflare Workers, via `@astrojs/cloudflare@13.5.0` + `wrangler@4.126.0`. Recommended and accepted in `context/foundation/infrastructure.md`; executed per the phased plan in `context/changes/deployment/deployment-plan.md` (full narrative, edge cases, and rationale live there — this file is the "what's live now" summary for downstream reference).

**Live URL**: https://10x-cards.devtencodes.workers.dev (Worker name `10x-cards`, renamed from the starter's default `10x-astro-starter` before first deploy).

**`compatibility_date`**: `2026-05-08` — deliberately **not** bumped to the deploy date. `@astrojs/cloudflare@13.5.0`'s bundled Vite plugin carries its own pinned, older `workerd` binary (capped at compat date `2026-05-14` for local dev emulation), independent of the standalone `wrangler` CLI's newer version. A later bump is safe for production (Cloudflare's real edge doesn't share this constraint) but will break local `astro dev`/`astro sync` until `@astrojs/cloudflare` itself is upgraded — which requires Astro 7 (out of scope for this deploy).

## Environment / secrets

- Two projects, deliberately separate: a **local Docker Supabase stack** (`supabase/config.toml`, `.env`/`.dev.vars`, `http://127.0.0.1:54321`) for dev, and a **separate cloud Supabase project** for production. Never share values between them.
- Production secrets (`SUPABASE_URL`, `SUPABASE_KEY`) are Cloudflare Workers Secrets, provisioned via the dashboard (not `wrangler secret put` — the account holder added them directly). Verify presence with `npx wrangler secret list` (names only, values are write-only).
- Env-access mechanism: `astro:env/server` (Astro's typed env API) — **confirmed working correctly at runtime** against real Workers Secrets on the first attempt, no fallback needed. If a future adapter/Astro upgrade breaks this again, the documented fallback is `import { env } from "cloudflare:workers"` in `src/lib/supabase.ts` / `src/lib/config-status.ts`.
- `OPENROUTER_API_KEY` is **not yet provisioned** — no code consumes it yet (AI-generation, PRD FR-004, hasn't shipped). Provision via the same route (dashboard or `wrangler secret put OPENROUTER_API_KEY`) when that feature lands.

## Auto-provisioned bindings (not explicitly requested)

Deploying with `@astrojs/cloudflare@13.5.0`'s defaults auto-created two live Cloudflare resources not previously in `wrangler.jsonc`:
- `SESSION` — a KV Namespace (`10x-cards-session`), for the adapter's session support
- `IMAGES` — a Cloudflare Images binding, for image processing

Neither is a problem, but both are real account resources now (subject to their own quotas/limits) that this plan didn't originally ask for — worth knowing if usage/billing ever looks unexpected.

## CI/CD

- **`.github/workflows/ci.yml`** (GitHub Actions): lint + build only, triggers on push/PR to `main`. **Never runs a deploy step.**
- **Production auto-deploy**: Cloudflare Workers Builds (native Git integration), connected to `devtencodes/10x-cards`, production branch `main`, non-production branch builds **enabled** (gives PR preview deploys). Every push to `main` triggers an independent Cloudflare-side build + deploy, visible as a `Workers Builds: 10x-cards` GitHub check alongside `ci`.
- First deploy was manual (`wrangler deploy`, local CLI); every deploy since has been automatic via Workers Builds.

## Rollback

- `wrangler rollback <version-id>` verified working: rolls back 100% of traffic to a prior Worker Version in seconds. Get version IDs via `wrangler deployments list`.
- **Caveat**: rollback reverts Worker code/config only — it does **not** revert Supabase schema state, KV/D1/R2 bindings' data, or the git branch it was deployed from. A deploy that ships a Supabase migration is not safely one-command-reversible; and after any rollback, remember to also revert the source on `main` (or the next push will silently redeploy the "rolled-back-from" version).
- `wrangler tail` confirmed working post-rollback for live log streaming.

## Known operational notes

- Cloudflare's free-tier request cap resets **daily**, not monthly — a single high-traffic day can exhaust it even if the monthly total looks fine. Worth a dashboard check if traffic ever becomes bursty.
- Access token in use for local/agent CLI operations is the developer's own broad-scope OAuth login (`wrangler login`), not a project-scoped API token. This was an explicit, accepted deviation from this project's CLAUDE.md production-access posture (scoped tokens, not master keys) — revisit before granting agent-driven access to anything more sensitive than Workers deploy/secrets (D1, KV, billing-adjacent scopes).

## References

- `context/foundation/infrastructure.md` — platform research, scoring, anti-bias cross-check, risk register
- `context/changes/deployment/deployment-plan.md` — full phased execution log (prerequisites, all 8 phases, every edge case hit and how it was resolved)
- `context/foundation/tech-stack.md` — corrected `deployment_target: cloudflare-workers` hint
