import { ASSESSMENT_METHODS, formatDuration, roundTo, type AssessmentMethod } from "@plyntiq/shared";

/** Today's date in the athlete's own calendar (ADR 0004), as YYYY-MM-DD. */
export function localToday(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** "Tue 20 Oct 2026" for a YYYY-MM-DD training date, without shifting time zones. */
export function formatTrainingDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatNumber(value: number, decimals = 2): string {
  return String(roundTo(value, decimals));
}

export { formatDuration };

export function methodLabel(method: AssessmentMethod): string {
  return ASSESSMENT_METHODS[method];
}

/** Text input → number for schema parsing; blank becomes undefined so the schema reports "Enter …". */
export function parseNumber(text: string): number | undefined {
  const t = text.trim();
  return t === "" ? undefined : Number(t);
}

/** Maps API or Zod issue paths ("sets.0.reps") to their messages, keeping the first per path. */
export function issuesByPath(issues: readonly { path: readonly PropertyKey[] | string; message: string }[]) {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const path = typeof i.path === "string" ? i.path : i.path.map(String).join(".");
    out[path] ??= i.message;
  }
  return out;
}
