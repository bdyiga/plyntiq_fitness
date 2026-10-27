# Phase 3: Analytics and Translation: Plan and Status

**Status:** plan, awaiting approval (2026-10-27)

## Objective
Athletes can see what their logged training adds up to (volume, estimated 1-rep max, PRs, frequency, consistency, conditioning load) and, on the Performance Translation report, how their training changed next to how their sprint and jump results changed over the same period, with data-quality flags instead of confidence scores. They can import history from a fixed CSV template and export their records as CSV.

All calculations are deterministic TypeScript, as specified in [analytics.md](analytics.md). No correlations, no composite scores, no causal wording.

## Decisions already taken
- **Estimated 1-rep max: Epley, reps 1–10 only.** `load × (1 + reps/30)`; 1 rep returns the load; sets above 10 reps get no estimate. Always labelled "estimated".
- **CSV import stays in M3 and is built last.** If M3 runs long, import moves to M4 without blocking anything else.

## Work items, in build order

### 1. `packages/analytics` (pure functions, no I/O)
New workspace package, imported by the API (and the web app only for types).

| Module | Functions |
|---|---|
| `strength.ts` | `setVolume`, `sessionVolume`, `estimateOneRepMax`, `bestE1rmByWeek`, `personalRecords` |
| `frequency.ts` | `weeklyFrequency`, `consistency` (ISO weeks of the local training date, empty weeks count as 0) |
| `conditioning.ts` | `sessionRpeLoad`, `weeklyConditioning` |
| `change.ts` | `percentChange(first, last, direction)`, positive = improved |
| `assessments.ts` | `dailyAssessmentValues` (mean of same-day trials), method and conditions per point |
| `translation.ts` | the translation engine (item 4) |
| `types.ts` | `AnalyticsResult { values, periods, dataQuality, provenance }` |

Inputs are canonical units only (`load_kg`, `distance_m`, `value_canonical`), mapped from rows in the API. Fixture tests cover the cases listed in analytics.md, including the PRD example (100 → 112 kg = +12.0 %; 3.20 → 3.10 s = 3.125 % improvement, shown as "≈ 3.1 %").

### 2. Analytics endpoints
| Method | Path | Returns |
|---|---|---|
| GET | `/api/analytics/strength?exerciseId=&from=&to=` | weekly volume, best e1RM per week, PRs, frequency, consistency |
| GET | `/api/analytics/conditioning?from=&to=` | weekly duration, distance and sRPE load |
| GET | `/api/analytics/assessments/:definitionId?from=&to=` | daily values with method, surface and footwear |
| GET | `/api/analytics/translation?definitionId=&exerciseId=` | item 4 |

Each route reads the athlete's own rows through the existing user-scoped repositories, so a foreign `exerciseId` returns 404 as elsewhere. The date range is capped at 2 years per request, to keep Worker CPU bounded. Results are computed per request; no caching tables in M3.

### 3. Progress charts
- Recharts, on a new **Progress** page: e1RM trend per exercise, weekly volume and frequency, weekly conditioning, and sprint and jump history with a marker shape per method.
- Every e1RM axis and tooltip says "estimated"; sRPE load says "arbitrary units".
- **The Progress and Report pages are lazy-loaded** (`React.lazy`), so Recharts doesn't grow the main bundle. It is already over Vite's 500 kB warning (see phase-2.md).

### 4. Translation engine and data-quality flags
Implements the algorithm and the seven flags in analytics.md, with two choices that analytics.md leaves open (see the open questions below):
- **Training series:** best e1RM per week for **one lower-body exercise**, because squat and deadlift e1RMs aren't comparable. It defaults to the lower-body exercise the athlete logged most often in the window, and the athlete can switch.
- **Assessments:** both sprint and jump are always available. The athlete's goal only decides which one is shown first (acceleration → sprint, lower-body power → jump).

### 5. Performance Translation report page
For each assessment: the training change and the assessment change side by side with their dates, both charts on the same time axis, and each raised flag as a plain-language note ("Your first and latest sprints used different timing methods, so they may not be comparable"). The wording is always "over the same period"; never "because", "led to" or "improved your". A copy test fails the build if any of a list of causal phrases appears in the page's strings.

### 6. CSV export (built before import, so it defines the format)
- `GET /api/me/export/:kind.csv` for `workouts` (one row per set), `conditioning` and `assessments`.
- Columns are the **same as the import template**, plus the canonical value, so an export can be re-imported.
- Formula-injection protection: cells starting with `= + - @`, tab or carriage return get a leading `'`. Negative numbers are numeric columns and aren't affected. Tested.

### 7. CSV import (last)
- **Flow:** upload → validate → preview → confirm, with undo.
  - `POST /api/imports` takes a CSV of up to 1 MB and 2,000 rows (the global 64 KB body limit is raised for this route only). It parses the file and validates every row with the **same shared Zod schemas** as the forms.
  - It returns a preview: valid rows, per-row errors, and warnings for rows that exactly match an existing record.
  - `POST /api/imports/:id/confirm` inserts all valid rows in one D1 batch, tagged with `import_job_id`.
  - `DELETE /api/imports/:id` undoes the import by deleting every record it created, including ones edited since. The UI warns about this.
- **Template:** one CSV per kind, matching the export. Exercises are matched by name (case-insensitive) against the catalog and the athlete's own exercises; an unknown name is a row error, never an auto-created exercise. Sets on the same date in one file become one workout.
- **Duplicate files:** unique (`user_id`, `file_sha256`), so re-uploading the same file is refused with a link to the earlier import.
- **Storage:** the raw file is never stored. Validated rows are staged as normalized JSON in `import_staged_rows` and deleted on confirm, or after 24 hours by a Worker cron trigger, as privacy.md requires. `import_row_errors` stores the row number, field and message only, never the cell values.
- **Parsing:** Papa Parse, which handles quoting, embedded commas, CRLF and BOM correctly in a Worker. Content is sniffed (it must decode as UTF-8 text with a recognised header row), whatever the file extension says.
- **Migration `0007_imports.sql`:** `import_jobs`, `import_staged_rows`, `import_row_errors`, plus a nullable `import_job_id` on `workouts`, `conditioning_sessions` and `assessment_results` (`ADD COLUMN`, no table rebuild).
- The JSON export moves to `exportFormatVersion` 3 to include import job metadata.

## Tests
- `packages/analytics`: a fixture test for every function and every flag, covering empty input, a single point, zero and negative values, mixed original units, unsorted dates, ties, and ISO weeks across a year boundary.
- API: analytics endpoints (shapes and numbers against a seeded athlete), plus **cross-account tests for analytics and imports**. Confirming, deleting or reading another athlete's import returns 404, and analytics never include another athlete's rows.
- Upload fuzzing: an empty file, header only, wrong headers, a binary file, a file over 1 MB, more than 2,000 rows, quoted commas, CRLF, BOM, formula cells, and dates in the future.
- Web: chart pages render with empty and populated data, and flags render as text.

## Acceptance criteria
- [ ] `packages/analytics` functions match analytics.md, including the PRD worked example
- [ ] Analytics endpoints are user-scoped, with cross-account tests
- [ ] Progress charts render on a phone; e1RM is labelled as an estimate everywhere
- [ ] Translation report shows both changes, dates and every raised flag, with no causal wording (copy test)
- [ ] CSV export round-trips through import; formula injection is neutralised (tested)
- [ ] CSV import: preview, confirm, undo, duplicate-file refusal, 24-hour cleanup; cross-account and fuzz tests pass
- [ ] Docs updated: `analytics.md`, `api.md`, `database.md`, `security.md` (closes the M3 rows), `privacy.md`, README, this file

## Open questions (my recommendation first)
1. **Typical-noise flag (`within_typical_noise`).** analytics.md gives a value only for hand-timed sprints (±0.1–0.2 s), and says the values should come from curated evidence, which arrives in M4. **Recommendation:** flag hand-timed sprints only, using 0.15 s, and show nothing for other methods until M4 verifies their values. Not inventing values matches the PRD rule.
2. **Training series for the translation report.** **Recommendation:** as in item 4: one lower-body exercise, defaulting to the most-logged one in the window, which the athlete can switch.
3. **Import cleanup.** **Recommendation:** a Worker cron trigger (free on Workers) once an hour, rather than cleaning up lazily on the next request, so staged data is gone within 24 hours even if the athlete never returns.

## Out of scope for M3
AI coach and evidence table (M4), flexible CSV column mapping, imports from other apps' formats, forecasting or ML.
