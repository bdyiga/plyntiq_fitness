# Phase 2: Tracking: Plan and Status

## Objective
Athletes can log strength workouts, conditioning sessions, and 20 m sprint and vertical jump results from a phone, see their history, and edit or delete any record. Every measurement keeps its original value and unit plus a canonical value, so the Milestone 3 analytics have clean data to read.

## Delivered
| Area | Files |
|---|---|
| Units | `packages/shared/src/units.ts`: kg↔lb, m/km/mi, cm↔in, durations (`s`, `mm:ss`, `h:mm:ss`), display rounding |
| Shared catalog and schemas | `packages/shared/src/catalog.ts` (37 exercises, conditioning types, assessment definitions, methods, surfaces, footwear), `schemas.ts`, `api-types.ts` |
| Migrations | `0003_exercises.sql` (+ seed), `0004_workouts.sql`, `0005_conditioning.sql`, `0006_assessments.sql` (+ seed) |
| API modules | `apps/api/src/modules/{exercises,workouts,conditioning,assessments}/`, `src/lib/pagination.ts`, export extended (`exportFormatVersion` 2) |
| Web | `WorkoutLoggerPage` (quick-add set, repeat last workout, custom exercises), `ConditioningFormPage`, `AssessmentFormPage`, `HistoryPage` (one tab per record type, edit, confirmed delete); dashboard quick-log buttons; Log and History nav |
| Docs | `database.md`, `api.md`, `security.md`, `privacy.md`, `architecture.md`, `backlog.md`, README |

## Verification performed (2026-10-27)
- `apps/api`: 113 integration tests passing in workerd with local D1 (73 new)
- `apps/web`: 18 component and routing tests passing (14 new)
- `packages/shared`: 21 tests passing (15 new, all units)
- Typecheck clean in all workspaces; `vite build` succeeds
- Manual smoke test through `wrangler dev` against a fresh local D1 with `wrangler d1 migrations apply`: all seven migrations apply; register, profile, create a workout (225 lb → `load_kg` 102.06), conditioning and jump (24 in → 60.96 cm); a sprint method on a jump is rejected; another athlete gets 404 on GET and DELETE; export v2 contains all record types; the SPA serves `/workouts/new`

**Not yet verified:** the pages on a real phone (layouts were built mobile-first but only checked in tests), and the migrations against a remote D1.

## Acceptance criteria
- [x] Unit conversion module with exact-value, round-trip, invalid-input and rounding tests
- [x] Global exercise catalog seeded with categories and lower-body flags, matching the shared catalog (tested)
- [x] Custom exercises: unique per athlete regardless of case; invisible to other athletes; archived instead of deleted once used in sets
- [x] Workouts and sets CRUD with server-computed `load_kg`, atomic writes, validation (reps 1–100, RPE 1–10, load ≥ 0) and pagination
- [x] Conditioning CRUD with optional distance pair, server-computed `distance_m` and CR-10 session RPE
- [x] Assessment definitions (20 m sprint, vertical jump) and results with method, surface, footwear and conditions; each definition accepts only its own units and methods
- [x] Cross-account tests for every new record type: foreign IDs → 404 on GET/PATCH/DELETE, a foreign exercise in a set → 400, a foreign cursor → no rows
- [x] Account deletion cascades to custom exercises, workouts, sets, conditioning and assessment results
- [x] Mobile-first logging pages with profile-based unit defaults; history lists with edit and confirmed delete
- [x] Export includes all new records and nothing from other athletes (tested)

## Decisions taken
- **Archive, don't delete, custom exercises in use.** History keeps the name; re-creating the name restores it.
- **Custom names may not shadow global exercises** (avoids two "Back squat" entries in the picker).
- **Dates are local calendar days with no time-zone handling.** The API accepts dates up to tomorrow in UTC, which covers "today" everywhere.
- **Plausibility ranges on assessments** (sprint 2–10 s, jump 5–150 cm) catch unit and decimal typos; they are not performance judgements.
- **Assessment defaults come from the previous result for the same test** (method, surface, footwear), which keeps repeat tests comparable.
- **Export key `conditioning`** (not `conditioningSessions`), so the existing "no session tokens in the export" check stays meaningful.

## Known gaps carried forward
- **Bundle size:** the main JS chunk is 516 kB minified (159 kB gzip), just over Vite's 500 kB warning. Fix with route-level code splitting in the M6 performance pass.
- When a required field is missing, the assessment form shows the definition rules (range, method fit) only after that field is fixed; Zod skips cross-field checks until then.
- CSV import, charts, e1RM and PRs (M3).
- Playwright E2E (M6).
