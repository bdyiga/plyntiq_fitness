# API Specification

Base path `/api`. JSON only. Authentication uses the session cookie set by `/api/auth/*`.

**Error envelope** (all non-auth routes):
```json
{ "error": { "code": "validation_failed", "message": "Request validation failed", "issues": [{ "path": "primarySportId", "message": "…" }] } }
```
Codes: `unauthenticated` 401, `forbidden_origin` 403, `not_found` 404, `validation_failed` 400, `payload_too_large` 413, `unsupported_media_type` 415, `internal_error` 500. Better Auth routes use Better Auth's own error shape.

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
| GET | `/me/export` | ✓ | JSON attachment with all of the user's data (no credentials) |

## Planned

| Milestone | Endpoints |
|---|---|
| M2 | `GET/POST /workouts`, `GET/PATCH/DELETE /workouts/:id` (with nested sets) · `GET /exercises` · `GET/POST /conditioning`, `PATCH/DELETE /conditioning/:id` · `GET /assessments/definitions` · `GET/POST /assessments`, `PATCH/DELETE /assessments/:id` |
| M3 | `GET /analytics/strength?exercise=…&from=&to=` · `/analytics/conditioning` · `/analytics/assessments/:definitionId` · `GET /analytics/translation?goal=…` |
| M3/M4 | `POST /imports` (multipart, ≤ 1 MB) → preview + errors · `POST /imports/:id/confirm` · `DELETE /imports/:id` (rolls back the records) |
| M4 | `POST /coach/messages` `{ question }` → `{ answer: { sections… }, toolResults, dataQuality }` |

List endpoints use `?limit` (max 100) and `?cursor` (opaque) pagination. IDs in paths are always ownership-checked (404 if not owned).
