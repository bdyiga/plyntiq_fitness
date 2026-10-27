# Threat Model and Security Checklist

## Assets
Athlete credentials, sessions, training and assessment history (personal data, sometimes health-adjacent), imported files, AI prompts and outputs, and the Cloudflare account and its secrets.

## Trust boundaries
Browser ↔ Worker (untrusted input) · Worker ↔ D1 · Worker ↔ AI provider (data leaves our control) · CSV files and free-text notes (untrusted content that may contain prompt injection).

## Threats (STRIDE-style) and mitigations
| Threat | Mitigation | Status |
|---|---|---|
| Credential stuffing / brute force | Per-IP rate limits on sign-in, sign-up and reset; generic errors; 12-character minimum password | ✅ tested |
| Session theft through XSS | HttpOnly cookie; token stripped from JSON; CSP (`script-src 'self'`); React escaping; no `dangerouslySetInnerHTML` | ✅ (CSP applies to assets via `_headers`) |
| CSRF | SameSite=Lax; Origin check; JSON-only; Better Auth trusted origins | ✅ tested |
| IDOR / cross-account access | Identity taken from the session only; user-scoped repositories; strict schemas; 404 on foreign IDs | ✅ tested for profile; **required for each new module** |
| Account enumeration | Identical sign-in errors; reset always returns 200 | ✅ tested |
| SQL injection | Drizzle parameterized queries; no raw SQL with interpolated input | ✅ |
| Oversized payloads / DoS | 64 KB body limit; per-route upload limits later; Cloudflare edge protection | ✅ |
| Information leakage in errors and logs | Safe error envelope; logs record only the error name and message; no bodies | ✅ |
| Secrets exposure | Secrets in `.dev.vars` (git-ignored) or `wrangler secret`; no secrets in vars | ✅ |
| CSV formula injection (exports) | Prefix cells starting with `= + - @ \t \r` with `'` | M3 |
| Malicious uploads | Content sniffing, size limit, row cap, streaming parse, no storage of raw files beyond the job | M3 |
| Prompt injection via notes or imports | Notes never go into system instructions; tool outputs are delimited as data; model can only call allow-listed, user-scoped tools; output validated against tool numbers | M4 |
| AI data leakage | Minimum fields sent to the model; no email or name; no cross-user context; usage logged without prompt text | M4 |
| AI cost abuse | Per-user daily request and token caps; global budget alarm | M4 |
| Account takeover through reset | 30-minute single-use tokens; all sessions revoked on reset | ✅ tested |

## Pre-beta checklist
- [x] Cross-account tests (profile)
- [x] Session invalidation on sign-out and reset
- [x] Cascade deletion verified
- [ ] Email provider configured; email verification on
- [ ] Production `BETTER_AUTH_SECRET` set; `APP_ORIGIN` and `BETTER_AUTH_URL` set to the production domain
- [ ] Workers Paid plan (scrypt CPU, [ADR 0003](adr/0003-password-hashing-cpu.md))
- [ ] Cross-account tests for workouts, conditioning, assessments and imports
- [ ] Upload fuzzing and formula-injection tests
- [ ] AI prompt-injection and leakage evaluation suite passing
- [ ] `npm audit` reviewed; Dependabot enabled
- [ ] D1 Time Travel / backup restore rehearsed
- [ ] Privacy notice published at the versioned URL
