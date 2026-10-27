# Privacy and Data Handling

## What we collect (M1)
| Data | Why | Retention |
|---|---|---|
| Name, email | Account, sign-in, reset emails | Until the account is deleted |
| Password hash | Authentication | Until deleted or changed |
| Adult attestation, privacy-notice version, timestamps | Legal basis and audit | Until the account is deleted |
| Sport, goal, unit preferences | Personalisation | Until the account is deleted |
| Session IP and user agent | Security (session list, abuse) | Session lifetime (≤ 7 days after expiry) |
| Rate-limit counters (keyed by IP and path) | Abuse prevention | Rolling window |

Later milestones add training records, assessments and imports (stored until the athlete deletes them), and AI usage metadata (token counts only, no prompt text, 90 days).

**Not collected:** date of birth, sex, body measurements, location or device sensors.

## Athlete rights
- **Export:** Settings → Export my data (`GET /api/me/export`), a full JSON file. Each module adds its records.
- **Deletion:** Settings → Delete account. The deletion is immediate and cascades in D1. D1 Time Travel backups keep point-in-time history for up to 30 days, after which the data is gone. The notice will state this.

## AI processing (M4)
Only the structured analytics results needed for a question are sent, without name or email. Workers AI runs on Cloudflare's network. If an external provider is added, it must be disclosed and must not train on our data.

## Historical data from other athletes
If records are contributed on behalf of other athletes, we need explicit permission from each athlete, confirmation that the contributor has authority to share, documented permitted uses (no model training unless separately consented), no public identifiable exposure, and support for deletion requests.

## Operational rules
- No production data on developer machines. Debugging uses synthetic data.
- Logs never contain request bodies, notes or measurements.
- Temporary import data is deleted when the job is confirmed or after 24 hours, whichever comes first.
