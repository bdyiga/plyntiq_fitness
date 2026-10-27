# Phase 1: Secure Foundation: Plan and Status

## Objective
A deployable, tested skeleton in which an adult athlete can register, sign in, complete onboarding, export their data and delete their account. It establishes the patterns (ownership-scoped repositories, strict validation, CSRF, error envelope) that every later module follows.

## Delivered
| Area | Files |
|---|---|
| Workspace | `package.json` (npm workspaces, `allowScripts`), `tsconfig.base.json`, `.nvmrc`, `.github/workflows/ci.yml` |
| Shared | `packages/shared/src/{catalog,schemas,api-types}.ts` |
| Worker | `apps/api/wrangler.jsonc`, `src/app.ts`, `src/auth/*`, `src/db/*`, `src/lib/*`, `src/modules/*` |
| Migrations | `0000_init.sql` (auth + profile tables), `0001_seed_catalog.sql` |
| Web | landing, register, login, forgot/reset password, onboarding, dashboard, settings; `RequireAuth` guard |
| Docs | everything in `docs/` |

## Verification performed (2026-10-26)
- `apps/api`: 30 integration tests passing in workerd with local D1
- `apps/web`: 4 component and routing tests passing
- `packages/shared`: 6 schema tests passing
- Typecheck clean in all workspaces; `vite build` succeeds
- Manual smoke test through `wrangler dev`: SPA fallback, sign-up, profile upsert, `/api/me`, security headers

**Not yet verified:** real deployment to Cloudflare (needs `wrangler d1 create` and secrets), and the CI workflow running on GitHub.

## Acceptance criteria
- [x] Register with adult and privacy attestation (enforced server-side)
- [x] Sign in and out; session cookie is HttpOnly + SameSite=Lax; token absent from bodies
- [x] Password reset end to end (dev mailer); old sessions revoked
- [x] Onboarding saves sport, goal and units; dashboard requires a profile
- [x] Export returns own data without credentials
- [x] Deletion cascades to every owned row
- [x] Cross-account and IDOR tests pass
- [x] Rate limiting on auth endpoints
- [x] Unknown routes, bad JSON, wrong origin and oversized bodies return safe JSON errors
- [ ] Deployed to a `*.workers.dev` URL (owner action; see `deployment.md`)

## Known gaps carried forward
- No email provider (production reset fails closed)
- Re-consent on privacy-version change
- Playwright E2E (M6)
