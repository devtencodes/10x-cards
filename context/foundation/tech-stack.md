---
starter_id: 10x-astro-starter
package_manager: npm
project_name: 10x-cards
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-workers
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
---

## Why this stack

A solo learner shipping 10xCards — an AI-flashcard-generation MVP — in 2 after-hours weeks needs a battle-tested, agent-friendly starter that handles auth and deploy out of the box so effort goes into the AI generation flow itself. 10x Astro Starter (Astro + React + TypeScript + Supabase + Cloudflare) is the recommended default for `(web, js)`, clears all four agent-friendly gates, and ships email/password auth (Supabase) directly against FR-001/FR-002. Its bootstrapper confidence is first-class — expect mostly-smooth scaffolding with occasional manual steps. The AI-generation requirement (FR-003/FR-004) is an application-level integration (an LLM API call from a TypeScript edge route) rather than a starter capability, so it doesn't force a different pick. Payments, realtime, and background jobs are out of scope per PRD non-goals. Deployment targets Cloudflare Workers (the starter's `@astrojs/cloudflare` adapter dropped Pages support at v13+; corrected here per `context/foundation/infrastructure.md`'s research and `context/changes/deployment/deployment-plan.md`'s executed deploy). CI runs on GitHub Actions for lint/build; production auto-deploy on merge to `main` is handled natively by Cloudflare Workers Builds (Git integration), not GitHub Actions — fitting a solo, short-timeline project.
