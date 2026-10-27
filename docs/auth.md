# Authentication and Authorization Design

## Authentication (implemented)
- **Library:** Better Auth 1.7 (email + password). No custom crypto ([ADR 0003](adr/0003-password-hashing-cpu.md)).
- **Sessions:** a random token stored server-side in `sessions` and sent as an `HttpOnly`, `SameSite=Lax` cookie. The cookie is `Secure` with a `__Secure-` prefix in production. Sessions last 7 days and refresh daily. The token is never present in JSON response bodies.
- **Passwords:** 12–128 characters, hashed with scrypt by Better Auth.
- **Registration:** requires `adultConfirmed: true` and the current `privacyPolicyVersion`, enforced server-side in a database hook (the client checks are only for UX).
- **Password reset:** a single-use token valid for 30 minutes. The response is identical whether or not the email exists. All sessions are revoked on reset.
- **Account deletion:** `POST /api/auth/delete-user` requires the password (or a session younger than 15 minutes) and cascades all data.
- **Rate limits** (per IP via `cf-connecting-ip`, stored in D1): sign-in 5/min, sign-up 5/10 min, reset request 3/10 min, reset 5/10 min, other auth routes 100/min.
- **Email:** a `Mailer` interface. Development prints to the console. **Production fails closed** until a provider is configured (backlog item before the beta). Email verification will be switched on at the same time.

## Authorization (implemented pattern)
1. `loadSession` resolves the user **only** from the cookie through Better Auth.
2. `requireAuth` returns 401 when there is no user.
3. Handlers get the identity from `requireUserId(c)`. Route params and bodies never carry owner IDs.
4. Repositories take `userId` as their first argument and add `WHERE user_id = ?` to every query. For child rows (sets in a workout), the repository checks the parent's ownership in the same query (`JOIN workouts … AND workouts.user_id = ?`). It returns **404, not 403**, for resources the user doesn't own, so their existence isn't revealed.
5. Request schemas are `.strict()`: unknown keys such as `userId` are rejected with a 400.

### Tests that enforce this
`apps/api/test/authorization.test.ts`: unauthenticated access, forged cookies, a body-smuggled `userId`, and A/B isolation. Every new module must add an equivalent cross-account test (read, update and delete another user's record by ID → 404).

## CSRF
Defence in depth for a same-origin app ([ADR 0001](adr/0001-single-worker-same-origin.md)):
- `SameSite=Lax` cookies
- Better Auth origin checks on `/api/auth/*` (`trustedOrigins = [APP_ORIGIN]`)
- `originCheck` on our own routes: unsafe methods require `Origin === APP_ORIGIN` and `Content-Type: application/json` (JSON can't be sent cross-site without a preflight, and no CORS is configured)
- No state changes on GET

## Later
- Re-consent prompt when `PRIVACY_POLICY_VERSION` changes
- Optional TOTP 2FA (Better Auth plugin)
- Coach/team roles are out of scope for the MVP. They will need explicit athlete-granted, revocable sharing records.
