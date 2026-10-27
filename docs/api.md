# API Specification

Base path `/api`. JSON only. Authentication uses the session cookie set by `/api/auth/*`.

**Error envelope** (all non-auth routes):
```json
{ "error": { "code": "validation_failed", "message": "Request validation failed", "issues": [{ "path": "primarySportId", "message": "…" }] } }
```
Codes: `unauthenticated` 401, `forbidden_origin` 403, `not_found` 404, `validation_failed` 400, `conflict` 409, `payload_too_large` 413, `unsupported_media_type` 415, `internal_error` 500. Better Auth routes use Better Auth's own error shape.

## Implemented (M1)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | – | `{ "status": "ok" }` |
| POST | `/auth/sign-up/email` | – | `{ name, email, password, adultConfirmed: true, privacyPolicyVersion }` → sets the cookie |
| POST | `/auth/sign-in/email` | – | `{ email, password }` → sets the cookie |
| POST | `/auth/sign-out` | ✓ | clears the session |
| GET | `/auth/get-session` | – | the current session (token removed) or `null` |
| POST | `/auth/request-password-reset` | – | `{ email, redirectTo: "/reset-password" }` → always 200 |
| GET | `/auth/reset-password/:token` | – | email link target; redirects to `/reset-password?token=…` |
| POST | `/auth/reset-password` | – | `{ token, newPassword }` |
| POST | `/auth/delete-user` | ✓ | `{ password }` → deletes the account and all data |
| GET | `/catalog/sports` | – | `{ sports: [{ id, name }] }` |
| GET | `/catalog/goals` | – | `{ goals: [{ id, name, quality }] }` |
| GET | `/me` | ✓ | `MeDto`: `{ user, profile \| null }` |
| PUT | `/me/profile` | ✓ | `{ primarySportId, primaryGoalId, preferredWeightUnit, preferredDistanceUnit }` (strict) → `{ profile }` |
| GET | `/me/export` | ✓ | JSON attachment with all of the user's data (no credentials); `exportFormatVersion` 2 adds `customExercises`, `workouts`, `conditioning` and `assessmentResults` |

## Implemented (M2)

All routes require a session. Request bodies are strict (unknown keys such as `userId`, `loadKg` or `valueCanonical` are rejected with 400), and canonical values are always computed by the server. An ID that belongs to another athlete returns the same 404 as one that does not exist.

| Method | Path | Description |
|---|---|---|
| GET | `/exercises` | `{ exercises: ExerciseDto[] }`: the global catalog plus the athlete's own (archived excluded) |
| POST | `/exercises` | `{ name, category, isLowerBody }` → 201 `{ exercise }`; 409 `conflict` if the name (case-insensitive) matches one of theirs or a global exercise |
| DELETE | `/exercises/:id` | Custom exercises only → `{ result: "deleted" | "archived" }` (archived when sets reference it) |
| GET | `/workouts` | `Page<WorkoutDto>`, newest `workoutDate` first, sets nested |
| POST | `/workouts` | `{ workoutDate, notes?, sets: [{ exerciseId, reps, loadValue, loadUnit, rpe? }] }` (1–100 sets) → 201 `{ workout }` |
| GET | `/workouts/:id` | `{ workout }` |
| PATCH | `/workouts/:id` | any of `{ workoutDate, notes, sets }`; `sets` replaces every set, in order → `{ workout }` |
| DELETE | `/workouts/:id` | 204; sets are deleted with it |
| GET | `/conditioning` | `Page<ConditioningSessionDto>` |
| POST | `/conditioning` | `{ sessionDate, type, durationS, distanceValue?, distanceUnit?, sessionRpe, notes? }` → 201 `{ session }` |
| GET / PATCH / DELETE | `/conditioning/:id` | `{ session }` / partial update (distance value and unit change together) / 204 |
| GET | `/assessments/definitions` | `{ definitions: AssessmentDefinitionDto[] }` |
| GET | `/assessments` | `Page<AssessmentResultDto>`; optional `?definitionId=` |
| POST | `/assessments` | `{ definitionId, assessedOn, value, unit, method, surface?, footwear?, conditionsNote?, notes? }` → 201 `{ result }` |
| GET / PATCH / DELETE | `/assessments/:id` | `{ result }` / partial update re-validated against the definition (`definitionId` cannot change) / 204 |

Validation highlights: reps are whole numbers from 1 to 100; set RPE is 1–10 in half steps (optional); load is ≥ 0 (0 = bodyweight); session RPE is 0–10 on the CR-10 scale; duration is from 0 to 24 h; dates must be real and no later than tomorrow (UTC). DTOs are in `packages/shared/src/api-types.ts` and the schemas in `schemas.ts`.

**Pagination:** list endpoints take `?limit` (1–100, default 20) and `?cursor`, and return `{ items, nextCursor }`. Pass `nextCursor` back until it is `null`. The cursor is an opaque keyset position (date, created time, ID) that carries no ownership, so a cursor from another account returns nothing extra.

## Planned

| Milestone | Endpoints |
|---|---|
| M3 | `GET /analytics/strength?exercise=…&from=&to=` · `/analytics/conditioning` · `/analytics/assessments/:definitionId` · `GET /analytics/translation?goal=…` |
| M3/M4 | `POST /imports` (multipart, ≤ 1 MB) → preview + errors · `POST /imports/:id/confirm` · `DELETE /imports/:id` (rolls back the records) |
| M4 | `POST /coach/messages` `{ question }` → `{ answer: { sections… }, toolResults, dataQuality }` |

IDs in paths are always ownership-checked (404 if not owned).
