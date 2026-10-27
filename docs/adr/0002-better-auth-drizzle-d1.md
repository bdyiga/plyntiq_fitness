# ADR 0002: Better Auth on D1 through the Drizzle adapter

**Status:** accepted (2026-10-26)

## Context
The prompt prefers Better Auth if it works reliably on Workers and D1. Version 1.7.14 was verified on 2026-10-26: the integration tests run inside workerd with a real D1, and a manual smoke test ran through `wrangler dev`.

## Decision
- Use `drizzleAdapter(db, { provider: "sqlite", schema })` with hand-written Drizzle tables, so auth and app tables share one schema and one migration history.
- Create `createAuth()` **per request**, because `env` (D1, secrets) is only available inside the request.
- Use email and password only for the MVP. No OAuth.
- Registration attestations (`adultConfirmed`, `privacyPolicyVersion`) are Better Auth `additionalFields`, enforced in a `databaseHooks.user.create.before` hook.
- Rate-limit storage is `"database"`. In-memory storage isn't shared across isolates.

## Consequences
- After a Better Auth upgrade, compare its expected fields with `src/db/schema/auth.ts`. The integration tests catch mismatches.
- Better Auth returns session tokens in JSON bodies. We strip them (`auth/strip-tokens.ts`) because we use cookies only.
