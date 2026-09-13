// Extracted from src/middleware.ts so it can be imported without pulling in
// `astro:middleware` (a virtual module Astro's bundler resolves specially —
// any import of middleware.ts drags that in, which breaks outside Astro's
// build pipeline, e.g. Playwright's plain Node ESM loader). This is the
// single source of truth for which route prefixes require a session;
// tests/e2e/protected-routes.spec.ts imports it directly.
export const PROTECTED_ROUTES = ["/dashboard", "/generate", "/flashcards", "/study"];
