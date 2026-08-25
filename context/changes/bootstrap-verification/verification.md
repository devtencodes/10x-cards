---
bootstrapped_at: 2026-08-25T10:12:59Z
starter_id: 10x-astro-starter
starter_name: 10x Astro Starter (Astro + Supabase + Cloudflare)
project_name: 10x-cards
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: npm audit --json
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: 10x-cards
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
```

### Why this stack

A solo learner shipping 10xCards — an AI-flashcard-generation MVP — in 2 after-hours weeks needs a battle-tested, agent-friendly starter that handles auth and deploy out of the box so effort goes into the AI generation flow itself. 10x Astro Starter (Astro + React + TypeScript + Supabase + Cloudflare) is the recommended default for `(web, js)`, clears all four agent-friendly gates, and ships email/password auth (Supabase) directly against FR-001/FR-002. Its bootstrapper confidence is first-class — expect mostly-smooth scaffolding with occasional manual steps. The AI-generation requirement (FR-003/FR-004) is an application-level integration (an LLM API call from a TypeScript edge route) rather than a starter capability, so it doesn't force a different pick. Payments, realtime, and background jobs are out of scope per PRD non-goals. Deployment defaults to Cloudflare Pages — what the starter ships with — and CI runs on GitHub Actions with auto-deploy-on-merge, fitting a solo, short-timeline project.

## Pre-scaffold verification

| Signal      | Value                                                    | Severity | Notes                                                                 |
| ----------- | --------------------------------------------------------- | -------- | ---------------------------------------------------------------------- |
| npm package | not run                                                    | n/a      | `cmd_template` starts with `git clone`, not an npm `create-*` CLI     |
| GitHub repo | przeprogramowani/10x-astro-starter last pushed 2026-08-22 | fresh    | from card `docs_url`; fetched via GitHub REST API (`gh` CLI unavailable in this environment, used `curl` as fallback) |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 18
**Conflicts (.scaffold siblings)**: CLAUDE.md.scaffold
**.gitignore handling**: append-merged (cwd's `.claude/` kept first, scaffold's lines appended after a `# from 10x-astro-starter` separator)
**.bootstrap-scaffold cleanup**: deleted (including its cloned `.git/`, removed before move-up)

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 1 CRITICAL, 13 HIGH, 7 MODERATE, 2 LOW
**Direct vs transitive**: 0/1/2/0 direct of total 1/13/7/2 (npm audit's `isDirect` field per package)

#### CRITICAL findings

- **tar** (range `<=7.5.20`, transitive, fix available) — node-tar: Decompression/parse DoS via unlimited input ([GHSA-23hp-3jrh-7fpw](https://github.com/advisories/GHSA-23hp-3jrh-7fpw), critical); bundle also carries several moderate/high node-tar advisories (PAX header smuggling, negative-size infinite loop, NUL-byte DoS, recursive mapHas DoS). `npm audit fix` reports a fix available.

#### HIGH findings

- **astro** (`<=7.0.9`, **direct**, fix available) — SSRF via Host header in prerendered error pages ([GHSA-2pvr-wf23-7pc7](https://github.com/advisories/GHSA-2pvr-wf23-7pc7), high), reflected XSS via unescaped slot name ([GHSA-8hv8-536x-4wqp](https://github.com/advisories/GHSA-8hv8-536x-4wqp), high), plus several moderate/low XSS advisories in the same chain.
- **brace-expansion** (`<=1.1.17 || 3.0.0-5.0.8`, transitive, fix available) — two DoS advisories via exponential/unbounded `{}` expansion ([GHSA-3jxr-9vmj-r5cp](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp), [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg), [GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895), all high).
- **devalue** (`5.6.3-5.8.0`, transitive, fix available) — DoS via sparse array deserialization ([GHSA-77vg-94rm-hx3p](https://github.com/advisories/GHSA-77vg-94rm-hx3p), high).
- **fast-uri** (`3.0.0-3.1.4`, transitive, fix available) — host confusion via backslash authority delimiter / IDN canonicalization, 3 advisories (high).
- **js-yaml** (`4.0.0-4.3.0`, transitive, fix available) — quadratic-CPU DoS via merge-key/omap handling, 2 high + 1 moderate advisory.
- **miniflare** (transitive, fix available) — no separate advisory entries; pulled in via the Cloudflare dev toolchain.
- **nanoid** (`<=3.3.17`, transitive, fix available) — non-secure/custom generators can loop indefinitely, 2 advisories (high).
- **postcss** (`<=8.5.22`, transitive, fix available) — path traversal in source-map auto-loading ([GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849), high) + a moderate incomplete-fix advisory.
- **sharp** (`<0.35.0`, transitive, fix available) — inherited libvips CVEs (2026-33327, 2026-33328, 2026-35590, 2026-35591) via [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj) (high).
- **svgo** (`4.0.0-4.0.1`, transitive, fix available) — `removeScripts` plugin leaves some executable scripts intact ([GHSA-2p49-hgcm-8545](https://github.com/advisories/GHSA-2p49-hgcm-8545), high).
- **undici** (`7.0.0-7.28.0`, transitive, fix available) — TLS validation bypass via SOCKS5 proxy, HTTP header injection, WebSocket DoS, cross-origin request routing, plus several moderate/low cache-related advisories (multiple high).
- **vite** (`7.0.0-7.3.3`, transitive, fix available) — `server.fs.deny` bypass on Windows alt paths ([GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff), high) + a moderate launch-editor advisory.
- **ws** (`8.0.0-8.20.1`, transitive, fix available) — memory-exhaustion DoS from tiny fragments ([GHSA-96hv-2xvq-fx4p](https://github.com/advisories/GHSA-96hv-2xvq-fx4p), high) + a moderate uninitialized-memory advisory.

#### MODERATE findings

- **@astrojs/language-server** (`2.14.0-2.16.10`, transitive) — editor-tooling dependency chain.
- **@cloudflare/vite-plugin** (transitive) — Cloudflare dev toolchain.
- **supabase** (`1.1.6-2.98.2`, **direct**) — Supabase CLI dependency chain.
- **volar-service-yaml** (`<=0.0.70`, transitive) — editor-tooling dependency chain.
- **wrangler** (`<=0.0.0-kickoff-demo || 3.108.0-4.101.0`, **direct**) — Cloudflare deploy CLI dependency chain.
- **yaml** (`2.0.0-2.8.2`, transitive) — editor-tooling dependency chain.
- **yaml-language-server** (transitive) — editor-tooling dependency chain.

#### LOW / INFO findings

- **@babel/core** (`<=7.29.0`, transitive).
- **esbuild** (`0.27.3-0.28.0`, transitive).

All 23 findings report a fix available per `npm audit`; none were investigated further or patched — see the "Next steps" note below.

## Hints recorded but not acted on

| Hint                     | Value              |
| ------------------------ | ------------------- |
| bootstrapper_confidence  | first-class          |
| quality_override         | false                |
| path_taken               | standard             |
| self_check_answers       | null                 |
| team_size                | solo                 |
| deployment_target        | cloudflare-pages     |
| ci_provider               | github-actions       |
| ci_default_flow          | auto-deploy-on-merge |
| has_auth                 | true                 |
| has_payments             | false                |
| has_realtime             | false                |
| has_ai                   | true                 |
| has_background_jobs      | false                |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history — this run's cwd already had a `.git/`, so no history was clobbered, but check `git status` to confirm what's staged.
- Review `CLAUDE.md.scaffold` against your existing `CLAUDE.md` and decide which content to keep (the starter's copy documents its own Astro/Supabase/Cloudflare conventions).
- Address audit findings per your project's risk tolerance: `npm audit fix` covers most of the 23 findings, all of which report a fix available; the one CRITICAL (`tar`) and the direct HIGH (`astro`) are worth prioritizing first.
- Copy `.env.example` to `.env` and fill in your Supabase/Cloudflare credentials before running the app.
