---
project: 10x-cards
researched_at: 2026-08-26
recommended_platform: Cloudflare Workers
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro + React
  runtime: Cloudflare Workers (workerd, via @astrojs/cloudflare)
---

## Recommendation

**Deploy on Cloudflare (Workers).**

Cloudflare clears all five agent-friendly criteria cleanly — deterministic CLI for deploy/rollback/log-tail, fully managed serverless runtime, markdown/`llms.txt` docs, a stable scriptable deploy API, and an official (if observability-scoped) MCP server. The developer interview reinforced this: existing hands-on Cloudflare familiarity, no persistent-connection requirement (so container-PaaS ops overhead buys nothing here), single-region traffic, and external Supabase/OpenRouter as the data/AI layer (no co-location need). At this project's scale (small user base, low QPS), Cloudflare's free tier covers the workload at $0, and its CPU-time billing model means the OpenRouter-bound AI-generation request — which is I/O-wait-heavy, not compute-heavy — is nearly free to run.

**One correction to the existing `tech-stack.md` hint**: that file's `deployment_target: cloudflare-pages` is stale. `@astrojs/cloudflare` dropped Pages support in v13+ and now targets **Workers** by default. The platform choice (Cloudflare) is unchanged; the deploy command is not (`wrangler deploy`, not `wrangler pages deploy`). This is carried into Getting Started and the risk register below.

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP/Integration | Total |
|---|---|---|---|---|---|---|
| Cloudflare | Pass | Pass | Pass | Pass | Pass | 5 Pass |
| Vercel | Pass | Pass | Pass | Pass | Partial (MCP in public beta) | 4 Pass / 1 Partial |
| Netlify | Partial (rollback is UI/API, no CLI verb) | Pass | Pass | Partial (same rollback gap) | Pass (GA MCP) | 3 Pass / 2 Partial |
| Railway | Pass | Partial (container PaaS, not serverless) | Pass | Pass | Partial (MCP maturity unconfirmed) | 3 Pass / 2 Partial |
| Fly.io | Pass | Partial (Dockerfile-owned VM, not serverless) | Pass | Pass | Partial (community-grade MCP) | 3 Pass / 2 Partial |
| Render | Partial (rollback is dashboard/API) | Partial (container web service) | Pass | Partial (rollback not native CLI) | Pass (GA MCP) | 2 Pass / 3 Partial |

**Notes per platform:**

- **Cloudflare**: `wrangler deploy` / `wrangler rollback` / `wrangler tail` are all deterministic, non-interactive CLI. Free tier (100k req/day, 10ms CPU-ms/invocation) covers this project's projected volume at $0; paid tier is $5/mo minimum if needed. Full `llms.txt`/`llms-full.txt` plus an open-source docs repo. Official Workers Observability MCP server is GA but scoped to logs/metrics, not full deploy/config management.
- **Vercel**: `vercel --prod` / `vercel rollback` / `vercel logs` are all GA and deterministic (Hobby rollback limited to the immediately-previous deployment). `llms-full.txt` published (community-reported minor dead links). Official MCP (`mcp.vercel.com`) is in **public beta**. Hobby (free) tier is **contractually restricted to non-commercial use** — a real constraint if 10xCards is ever monetized.
- **Netlify**: `netlify deploy --prod` is deterministic; rollback is "publish a prior deploy" via dashboard/API, not a first-class CLI verb. Official `netlify-mcp` server is GA and explicitly recommended for agent workflows. Serverless functions default to a **10s wall-clock timeout** — a real risk for OpenRouter calls generating up to 20 flashcards (FR-004), since Netlify bills/limits on wall-clock time, unlike Cloudflare's CPU-time model.
- **Railway**: `railway up` / `railway logs` / `railway redeploy` are GA and CLI-first, but the platform is a container PaaS (Railpack build), not serverless — more ops surface (adapter config, `0.0.0.0` binding) for no benefit given no persistent-connection requirement. MCP is newly shipped with unconfirmed maturity.
- **Fly.io**: `fly deploy` / `fly logs` are GA; no native rollback command (workaround: redeploy a prior image digest). Requires owning a Dockerfile — appropriate for always-on processes, unnecessary ops overhead for this stateless MVP. MCP tooling is community-grade, not a flagship GA product.
- **Render**: CLI covers deploy/logs but rollback is dashboard/API-driven, not a native CLI verb. Official MCP server is GA for infra ops. Free tier spins down after 15 min idle (~1 min cold start) and is explicitly not production-recommended by Render itself.

### Shortlisted Platforms

#### 1. Cloudflare (Recommended)

Clean sweep on all five criteria. Matches existing developer familiarity (interview Q3). No persistent-connection requirement (Q1 = No) means the container-PaaS alternatives' operational strengths are wasted here. CPU-time billing is a structural advantage for an I/O-bound AI-generation workload. Already the bootstrapper's stated default (`tech-stack.md`), modulo the Pages→Workers correction above.

#### 2. Vercel

Strong all-around DX and a fully GA deploy/rollback/logs CLI loop. Loses ground on two points: the free Hobby tier's non-commercial-use restriction is a real constraint for a project that could later monetize, and its MCP server is still in public beta (functional, but a softer signal than Cloudflare's or Netlify's GA offerings).

#### 3. Netlify

The official GA MCP server is a genuine agent-integration strength — arguably the best of the six candidates on that single criterion. However, the default 10-second serverless function timeout is a concrete, stack-specific risk: this project's core value prop (FR-004, generating up to 20 flashcards via OpenRouter) is exactly the kind of request most likely to approach that ceiling, and Netlify's wall-clock billing model doesn't offer Cloudflare's CPU-time cushion.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **CPU-time billing is a trap for the OpenRouter call specifically.** Workers' CPU-ms limits apply to *active* CPU time, not wall-clock — but JSON parsing/validation of a large LLM response (up to 20 flashcards) and any per-card post-processing is active CPU, and could plausibly exceed the free tier's per-invocation ceiling on a slow day, forcing an unplanned upgrade to the $5/mo paid plan mid-MVP.
2. **The adapter's Pages→Workers migration (v13+) is recent enough that community tutorials, Stack Overflow answers, and even some AI training data still reference the old Pages-based workflow** — a solo learner following a stale guide could burn hours debugging a `wrangler pages deploy` command against a Workers-only adapter.
3. **`nodejs_compat` is necessary for many npm packages (including some Supabase client internals) but is not a full Node.js polyfill** — any transitive dependency doing raw TCP, native bindings, or unsupported Node APIs fails silently or with an opaque `workerd` error, costing debugging time disproportionate to a 2-week timeline.
4. **No built-in background/queue primitive for retrying a failed OpenRouter call** — Workers are still fundamentally request-scoped; a retry-with-backoff pattern for the NFR "no silent failure" requirement has to be hand-rolled in the request path (adding latency) rather than offloaded, since Queues/Durable Objects are extra setup a 2-week MVP likely skips.
5. **Local dev fidelity gap**: `wrangler dev` emulates `workerd` but Supabase client libraries and some npm packages behave subtly differently under Miniflare/workerd vs. Node — a bug that only appears in production is a realistic failure mode for a solo dev without a staging environment.

### Pre-Mortem — How This Could Fail

Six months after launch, 10xCards' Cloudflare deployment is a source of recurring frustration. The team assumed `wrangler deploy` plus the Astro adapter would "just work" the way local `npm run dev` did, but the first production AI-generation request revealed subtle differences between Node and `workerd` runtime behavior in a transitive Supabase dependency, causing intermittent 500s that took days to root-cause because local `wrangler dev` didn't reproduce them. Meanwhile, nobody had budgeted for the CPU-time billing model — a batch-generation feature added post-MVP pushed several requests over the free tier's per-invocation CPU cap, and the team's first signal was silent errors in production, not a graceful upgrade prompt. The solo developer, having learned Cloudflare years earlier via Pages, kept reaching for `wrangler pages` commands from muscle memory and stale bookmarked docs, wasting a full evening before realizing the adapter had moved to Workers-only. Rollbacks, while technically one command, were never tested until an actual incident — and the team discovered `wrangler rollback` reverts code but not the Supabase schema migrations that shipped alongside it, leaving the rolled-back app pointed at a schema it didn't expect.

### Unknown Unknowns

- Cloudflare's CPU-time model means a "slow" request (waiting on OpenRouter) is nearly free, but a "busy" request (large JSON parsing, regex, template rendering) is billed — the intuition that "slow = expensive" from other platforms is inverted here and can mislead cost estimation.
- `wrangler rollback` reverts the Worker's code/config to a prior deployment, but has no awareness of external state (Supabase schema, OpenRouter prompt versions) — a rollback can leave the app in a mismatched state if a migration shipped in the same release.
- Cloudflare's free-tier request cap resets **daily** (100k/day), not monthly — a spike on one day can exhaust the daily quota and return errors for the rest of that day even though the monthly total looks fine.
- Environment variable and secrets access changed API shape recently (`import { env } from 'cloudflare:workers'` vs. the older `Astro.locals.runtime.env` pattern) — copying a slightly older tutorial's env-access code is a subtle, hard-to-spot bug source.
- The official Cloudflare MCP server currently covers observability only, not full deploy/config management — an agent expecting to manage secrets or bindings via MCP will find only logs/metrics exposed, and still needs the CLI for the rest.

**Decision**: proceed with Cloudflare Workers, risks absorbed into the register below (user confirmed after cross-check).

## Operational Story

- **Preview deploys**: Cloudflare Workers versions/previews are created per `wrangler versions upload`, or automatically per-PR if Cloudflare's GitHub integration/Workers Builds is connected to the repo; each preview gets a unique `*.workers.dev` URL. No additional access protection is configured by default — add Cloudflare Access if preview URLs should not be publicly reachable.
- **Secrets**: Runtime secrets (Supabase service key, OpenRouter API key) live in Cloudflare Workers Secrets (`wrangler secret put <NAME>`), scoped to this Worker only — not committed to the repo, not visible in `wrangler.jsonc`. Rotation is `wrangler secret put <NAME>` again followed by a redeploy; only the account holder (or a scoped API token permitted for this Worker) can read/write them.
- **Rollback**: `wrangler rollback [deployment-id]` reverts code/config to a prior version in seconds. Caveat (see risk register): this does not revert Supabase schema migrations shipped in the same release — a rollback that crosses a migration boundary needs a manual Supabase-side revert too.
- **Approval**: Human-only — creating the Cloudflare account/API token, provisioning the Workers Secrets for the first time, and any DNS/custom-domain changes. An agent may run `wrangler deploy`, `wrangler rollback`, and `wrangler tail` unattended once secrets are provisioned, per the project's scoped-token posture.
- **Logs**: `wrangler tail` streams live production logs to the terminal (read-only). The Workers Observability MCP server (`observability.mcp.cloudflare.com/mcp`) exposes the same data as structured MCP tool calls when many discovery-style log queries are needed.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| A large flashcard-generation response (up to 20 cards) exceeds free-tier CPU-ms per invocation | Devil's advocate | M | M | Monitor CPU-ms via `wrangler tail`/dashboard early; budget for the $5/mo paid tier if the free-tier ceiling is hit — it's a config change, not a re-architecture |
| Solo developer follows stale Pages-era tutorials/docs (`wrangler pages deploy`) instead of the current Workers-only workflow | Devil's advocate | H | L | Getting Started below uses only the verified current commands; bookmark `developers.cloudflare.com/workers/` (not `/pages/`) as the reference |
| `nodejs_compat` doesn't fully polyfill a transitive Supabase/npm dependency, causing an opaque `workerd` runtime error | Devil's advocate | M | M | Test the Supabase client against `wrangler dev` (which uses the real `workerd` runtime) before assuming Node-only behavior; check `nodejs_compat` coverage docs for any dependency that fails |
| A retry-with-backoff for failed OpenRouter calls has no queue primitive to lean on and must be hand-rolled in the request path | Devil's advocate | M | L | Implement a simple bounded in-request retry (1-2 attempts) rather than reaching for Cloudflare Queues at MVP scope; revisit if failure rates are high in practice |
| `wrangler rollback` reverts code but not Supabase schema state, leaving a rolled-back app pointed at a schema it doesn't expect | Pre-mortem | L | H | Treat any deploy that includes a Supabase migration as non-trivially-reversible; snapshot the schema (or write a paired down-migration) before deploying schema changes |
| Free-tier request cap resets daily, not monthly — a single high-traffic day can exhaust it and produce errors for the rest of that day | Unknown unknowns | L | M | Track daily request count via `wrangler tail`/dashboard if traffic ever becomes bursty; low likelihood at this project's projected scale |
| Env/secrets access pattern recently changed (`cloudflare:workers` import vs. `Astro.locals.runtime.env`) — copying older tutorial code is a subtle bug source | Unknown unknowns | M | L | Use the current `import { env } from 'cloudflare:workers'` pattern exclusively; verify against the installed `@astrojs/cloudflare` version's own docs, not a cached tutorial |
| Official Cloudflare MCP server only covers observability, not deploy/secrets/config — an agent may assume broader MCP coverage than exists | Research finding | M | L | Default to CLI (`wrangler`) for deploy/config/secrets; use the Observability MCP server only for log/metric queries, per the CLI vs. MCP guidance already in this project's CLAUDE.md |

## Getting Started

1. Confirm the installed adapter version and its target: `npm ls @astrojs/cloudflare` (expect v13+, Workers-only — do not follow any Pages-era tutorial or `wrangler pages` command).
2. Install Wrangler if not already present: `npm i -D wrangler` (or use the version the starter already pinned).
3. Authenticate: `npx wrangler login`.
4. Provision runtime secrets (do this once, before the first deploy): `npx wrangler secret put SUPABASE_URL`, `npx wrangler secret put SUPABASE_ANON_KEY` (and service key if used server-side), `npx wrangler secret put OPENROUTER_API_KEY`.
5. Deploy: `npm run build && npx wrangler deploy`. Confirm the returned `*.workers.dev` (or custom domain) URL responds correctly, then verify a real AI-generation request end-to-end before considering the deploy complete.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture (multi-region, HA, DR)
