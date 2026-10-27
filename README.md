# Plyntiq

An athletic performance intelligence platform built to answer one question: **is the training I do outside my sport making me a better athlete?**

Plyntiq lets athletes log strength and conditioning work and sprint and jump assessments. It then shows, with transparent and deterministic calculations, how changes in their training line up with changes in their measurable performance. An AI coach (planned for Milestone 4) explains those results using only verified numbers. It never claims that one change caused another.

> **Status:** Milestone 2 (tracking) is done: workout, conditioning and sprint/jump logging with history, edit and delete, on top of the Milestone 1 foundation. See [docs/phase-2.md](docs/phase-2.md) and [docs/phase-1.md](docs/phase-1.md).

## Stack

| Layer | Choice |
| --- | --- |
| Frontend | React 19, TypeScript, Vite 8, Tailwind 4, React Router 8, TanStack Query |
| API | Cloudflare Workers, Hono, Zod |
| Database | Cloudflare D1 (SQLite), Drizzle ORM, SQL migrations |
| Auth | Better Auth (email + password, HTTP-only session cookies) |
| Tests | Vitest 4 (`@cloudflare/vitest-pool-workers` for the API, jsdom + Testing Library for the web app) |

One Worker serves both the SPA (Workers Static Assets) and `/api/*`. Everything is on the same origin, so there is no CORS and cookies are first-party.

## Repository layout

```
apps/api         Cloudflare Worker: Hono routes, Better Auth, Drizzle schema, migrations
apps/web         React SPA
packages/shared  Zod schemas, catalog constants and DTO types used by both apps
docs/            PRD, architecture, schema, API, security, roadmap, ADRs
```

## Prerequisites

- Node.js 24 (24.15+ recommended; see `.nvmrc`)
- npm 12. Install with `npx npm@12.2.1 ci`. npm 11 crashes on this workspace because of an arborist peer-set bug, and npm 12 enforces the `allowScripts` list in `package.json` (only esbuild, workerd and fsevents may run install scripts).

## Local development

```bash
npx -y npm@12.2.1 ci                              # install
cp apps/api/.dev.vars.example apps/api/.dev.vars  # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
npm run db:migrate:local                          # create local D1 tables + seed catalog
npm run dev                                       # API on :8787, web on :5173 (open this one)
```

Vite proxies `/api` to the Worker, so the browser only talks to `http://localhost:5173`. In development, password-reset emails are printed to the Wrangler console.

## Tests

```bash
npm test          # all workspaces
npm run typecheck
```

- `apps/api/test`: integration tests that run inside workerd against a real local D1, with migrations applied. They cover registration, sign-in and sign-out, rate limiting, password reset, cross-account isolation (profile and every training record type), validation, pagination, CSRF, export and cascading deletion.
- `apps/web/test`: form validation and route guards.
- `packages/shared`: schema tests.

## Database changes

1. Edit `apps/api/src/db/schema/*.ts`
2. `npm run db:generate` (drizzle-kit writes `apps/api/migrations/NNNN_*.sql`)
3. Review the SQL, then `npm run db:migrate:local`

## Deployment

See [docs/deployment.md](docs/deployment.md).

## Documentation

- [Product requirements](docs/PRD.md)
- [Architecture](docs/architecture.md) and [ADRs](docs/adr/)
- [Database schema](docs/database.md)
- [Authentication and authorization](docs/auth.md)
- [API specification](docs/api.md)
- [Analytics engine](docs/analytics.md)
- [Threat model and security checklist](docs/security.md)
- [Privacy and data handling](docs/privacy.md)
- [Backlog and roadmap](docs/backlog.md)
- [Phase 1 plan and status](docs/phase-1.md)
