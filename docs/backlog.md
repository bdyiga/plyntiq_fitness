# Prioritized Backlog and Roadmap

Planning estimate at 15–20 h/week. These are targets, not commitments.

## M1: Secure foundation (weeks 1–2) ✅
Monorepo, Worker and SPA on one origin, D1 and migrations, Better Auth, onboarding and profile, export, deletion, authorization pattern, CI, docs.

## M2: Tracking (weeks 3–4)
1. Unit conversion module (`packages/shared/units.ts`) with tests: kg↔lb, m/km/mi, s, cm/in
2. Exercise catalog seed (lower-body flags) and custom exercises
3. Workouts and sets CRUD, plus cross-account tests
4. Conditioning CRUD, plus cross-account tests
5. Assessment definitions (20 m sprint, vertical jump) and results CRUD, with method and conditions
6. Logging UIs (mobile-first): quick-add set, repeat last workout
7. History lists and edit/delete
8. Extend the export to include the new records

## M3: Analytics + translation (weeks 5–7)
1. `packages/analytics`: volume, e1RM, PRs, frequency, consistency, percent change, sRPE (fixture-tested)
2. Analytics endpoints
3. Progress charts (Recharts): e1RM trend, weekly volume and frequency, sprint and jump history with method markers
4. Translation engine plus data-quality flags
5. Performance Translation report page
6. Fixed-template CSV import: upload → validate → preview → confirm; SHA-256 duplicate check; provenance; undo
7. CSV export with formula-injection protection

## M4: AI coach (weeks 8–9)
1. Verify current Workers AI models that support function calling; build the provider abstraction
2. Allow-listed tools (`getStrengthProgression`, …) wrapping the analytics endpoints
3. Answer schema (direct answer, measurements, changes, interpretation, limitations, evidence, next step) plus output validation (every number in the answer must appear in the tool results)
4. Curated evidence table (5–10 hand-verified sources)
5. Usage logging, per-user caps, graceful fallback
6. Evaluation suite (see the master prompt §10)

## M5: Private beta (weeks 10–11)
Email provider plus verification, production deployment, monitoring and alerts, published privacy notice, security checklist, onboarding of about 5 rugby athletes, feedback form.

## M6: Hardening (weeks 12–14)
Playwright E2E (register → log → report → coach), performance pass, backup and restore drill, deploy automation (GitHub Actions → `wrangler deploy` on tag), release review.

## Deferred (not MVP)
Forecasting/ML, RAG with Vectorize, MCP, Strava/Garmin/Apple Health, team and coach dashboards, flexible CSV column mapping (unless time allows in M3), 2FA.
