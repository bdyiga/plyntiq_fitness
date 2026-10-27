# ADR 0001: Single Worker, same-origin SPA and API

**Status:** accepted (2026-10-26)

## Context
The SPA and API could be deployed separately (Pages plus a Worker on another subdomain) or together.

## Decision
Use one Worker with Workers Static Assets (`not_found_handling: single-page-application`, `run_worker_first: ["/api/*"]`). In development, Vite proxies `/api` to `wrangler dev`, so the browser is same-origin in both environments.

## Consequences
- No CORS configuration and no cross-site cookies. `SameSite=Lax` plus an Origin check gives a simple CSRF story.
- One deploy unit and one version.
- Static asset requests don't invoke the Worker (free and fast). Security headers for assets therefore come from `apps/web/public/_headers`.
- If a native mobile client is added later, it will need bearer tokens, which is a separate decision.
