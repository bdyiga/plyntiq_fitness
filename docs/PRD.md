# Product Requirements: Plyntiq MVP

## Problem
Athletes spend hours on gym and conditioning work outside their sport but have no simple way to see whether that work is improving the physical qualities that matter on the field. Existing tools either log workouts (Fitbod, Alpha Progression), deliver programs (Volt, TrainHeroic, TeamBuildr), or test athletes (Metric). None of them connect the three clearly or honestly.

## Central question
"Is the training I do outside my sport actually making me a better athlete?"

## Users
- **Launch:** individual adult rugby athletes, recreational to semi-pro, training without a dedicated S&C coach.
- **Later:** athletes in other sports. The product is **goal-driven, not sport-driven**: "Improve acceleration" uses the same analytics for every sport.
- **Out of scope:** minors, teams and coaches, clinical or injury use.

## Differentiators (what we invest in)
1. **Performance Translation report:** training progression shown next to assessment progression over aligned periods, with data-quality flags.
2. **Ask Your Training Data:** an AI coach that explains the athlete's own verified numbers. It does not invent numbers and does not make causal claims.
3. **Historical import:** CSV import, so athletes don't start from zero.
4. **Evidence-informed:** a small, hand-curated set of research references, kept separate from athlete measurements.
5. **Accessible:** no wearables needed. A phone stopwatch and a tape measure are enough.

We will **not** chase feature parity with program libraries, exercise video catalogs or team management.

## MVP capabilities
| # | Capability | Milestone |
|---|---|---|
| F1 | Accounts and profile: register, sign in and out, reset password, sport, goal, units, export, delete | M1 ✅ |
| F2 | Strength tracker: exercise, date, sets × reps × load, unit, optional RPE and notes. Volume, frequency, e1RM (labelled as an estimate), PRs, consistency | M2 + M3 |
| F3 | Conditioning tracker: type, duration, distance, session RPE. Weekly duration, distance trend, sRPE load (labelled as an estimate, not fatigue) | M2 + M3 |
| F4 | Assessments: 20 m sprint and vertical jump, with method and conditions. The definition table is extensible | M2 |
| F5 | Performance Translation Engine: deterministic, descriptive comparisons with insufficient-data and inconsistent-conditions flags | M3 |
| F6 | AI coach: tool-based retrieval of verified analytics, a structured answer format, graceful degradation | M4 |
| F7 | CSV import: fixed template first, then preview, validation, duplicate detection and provenance | M3/M4 |

## Non-negotiable analytical rules
- Report measured changes, never causation ("over the same period", never "because").
- No correlations computed from sparse data. Minimum observation counts are documented in [analytics.md](analytics.md).
- Original values and units are preserved. Normalization happens at calculation time.
- No composite "athlete scores" and no invented confidence percentages.

## Success criteria
See the master prompt §14. Summary: secure auth, correct calculations backed by unit tests, accurate charts, working CSV import, grounded AI answers, cross-account tests passing, usable on mobile, and still usable when AI is unavailable.

## Pilot
About 5 adult rugby athletes for 8–12 weeks. We will measure logging consistency, how well athletes understand the reports, AI answer accuracy and perceived usefulness. The pilot will not be used to claim causal or predictive validity.
