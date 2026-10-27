# Analytics Engine Architecture

The engine is pure, deterministic TypeScript in `packages/analytics` (built in M3). It has no I/O and no AI, and the same input always produces the same output. Both the dashboard and the AI coach consume its structured results. The model never computes numbers itself.

## Layers
```
repositories (user-scoped SQL) → mappers (rows → typed inputs, canonical units)
  → calculations (pure fns) → translation engine (aligns + compares)
  → AnalyticsResult { values, periods, dataQuality flags, provenance }
```

## Calculations

| Function | Formula / rule | Notes and limits |
|---|---|---|
| `setVolume` / `sessionVolume` | Σ reps × load_kg | Bodyweight exercises with load 0 contribute 0. Documented, not imputed. |
| `estimateOneRepMax` | Epley: load × (1 + reps/30). Only for reps 1–10 | **Labelled as an estimate.** Accuracy drops with higher reps and near failure. Reps = 1 returns the load itself. |
| `bestE1rmByPeriod` | max e1RM per exercise per ISO week | |
| `personalRecords` | strictly greater than all previous for (exercise, reps) and best e1RM | Ties are not PRs. |
| `weeklyFrequency` | distinct training dates per ISO week | Weeks with no sessions count as 0 within the range. |
| `consistency` | weeks with ≥ 1 session ÷ weeks in range | Descriptive only. |
| `percentChange(first, last, direction)` | (last − first) / first × 100. For lower-is-better metrics (sprint time), improvement = (first − last)/first × 100 | first must be > 0. Sign convention: positive means improved. |
| `sessionRpeLoad` | duration_min × session RPE (CR-10), "arbitrary units" | **Not a measurement of fatigue.** |
| `weeklyConditioning` | Σ duration, Σ distance_m, Σ sRPE load per ISO week | |

Worked example from the PRD: e1RM 100 → 112 kg is +12.0%; sprint 3.20 → 3.10 s is a 3.125% improvement, which is displayed as "≈ 3.1%". This becomes a fixture test.

## Performance Translation Engine
Input: the goal, a training series (for example, best lower-body e1RM per week) and an assessment series.

1. Choose the comparison window: from the first assessment to the latest assessment, and use training data inside that window.
2. Training change = baseline (best e1RM in the 14 days up to the first assessment) compared with the current value (best e1RM in the 14 days up to the latest assessment).
3. Assessment change = first result compared with the latest result (or the mean of same-day trials when there are several).
4. Output both changes side by side with their dates. **No causal language and no single combined score.**

### Data-quality flags (shown to users, not a confidence %)
| Flag | Rule |
|---|---|
| `insufficient_assessments` | fewer than 2 results for the assessment |
| `insufficient_training` | no qualifying lifts in either baseline window |
| `short_window` | fewer than 28 days between the first and latest assessment |
| `method_changed` | the first and latest assessments used different methods (e.g. hand-timed vs gates) |
| `conditions_differ` | surface or footwear differs |
| `stale_assessment` | latest assessment is more than 60 days old |
| `within_typical_noise` | the change is smaller than the method's typical variability (hand-timed sprint ±0.1–0.2 s, a value taken from curated evidence) |

Correlation coefficients are **not computed** in the MVP. With the pilot's handful of assessments per athlete, they would mislead.

## Testing
Every function gets fixture-based Vitest tests covering edge cases: empty input, a single point, zero or negative values, mixed units, unsorted dates, ties and DST-irrelevant date handling. Translation tests assert both the numbers and the flags.
