import type { BetterDirection } from "./types";

export class ChangeError extends Error {
  override name = "ChangeError";
}

/**
 * Percent change where **positive always means improved**:
 * higher-is-better: (last − first) / first × 100;
 * lower-is-better (sprint time): (first − last) / first × 100.
 * `first` must be > 0. Full precision; round only for display.
 */
export function percentChange(first: number, last: number, direction: BetterDirection): number {
  if (!Number.isFinite(first) || !Number.isFinite(last)) throw new ChangeError("Values must be finite numbers");
  if (first <= 0) throw new ChangeError("The first value must be greater than 0");
  const delta = direction === "higher" ? last - first : first - last;
  return (delta / first) * 100;
}
