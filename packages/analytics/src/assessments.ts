import type { AssessmentInput, IsoDate } from "./types";

export interface DailyAssessment {
  date: IsoDate;
  /** Mean of the day's trials, canonical units. */
  value: number;
  trials: number;
  /** Distinct methods, surfaces and footwear recorded that day, sorted. Unrecorded ones are omitted. */
  methods: string[];
  surfaces: string[];
  footwear: string[];
}

function distinct(values: readonly (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => v !== null))].sort();
}

/** One point per assessment date: the mean of same-day trials, in date order. */
export function dailyAssessmentValues(results: readonly AssessmentInput[]): DailyAssessment[] {
  const byDate = new Map<IsoDate, AssessmentInput[]>();
  for (const r of results) {
    const day = byDate.get(r.date);
    if (day) day.push(r);
    else byDate.set(r.date, [r]);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, trials]) => ({
      date,
      value: trials.reduce((sum, t) => sum + t.valueCanonical, 0) / trials.length,
      trials: trials.length,
      methods: distinct(trials.map((t) => t.method)),
      surfaces: distinct(trials.map((t) => t.surface)),
      footwear: distinct(trials.map((t) => t.footwear)),
    }));
}
