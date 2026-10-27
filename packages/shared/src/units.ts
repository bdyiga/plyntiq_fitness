/**
 * The one conversion module (ADR 0004). Writes store the original value and
 * unit plus a canonical value (kg, m, s, cm) computed here; analytics read
 * only the canonical columns. Canonical values keep full precision — round
 * only for display, with `roundTo`.
 */
import { DISTANCE_UNITS, WEIGHT_UNITS, type DistanceUnit, type WeightUnit } from "./catalog";

export const HEIGHT_UNITS = ["cm", "in"] as const;
export type HeightUnit = (typeof HEIGHT_UNITS)[number];

/** Exact by international definition (1959 yard and pound agreement). */
const KG_PER_LB = 0.45359237;
const M_PER_MI = 1609.344;
const CM_PER_IN = 2.54;

const KG_PER: Record<WeightUnit, number> = { kg: 1, lb: KG_PER_LB };
const M_PER: Record<DistanceUnit, number> = { m: 1, km: 1000, mi: M_PER_MI };
const CM_PER: Record<HeightUnit, number> = { cm: 1, in: CM_PER_IN };

export class UnitError extends Error {
  override name = "UnitError";
}

function assertMeasurement(value: number): void {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new UnitError("Value must be a finite number");
  if (value < 0) throw new UnitError("Value must not be negative");
}

function factor<U extends string>(table: Record<U, number>, unit: U): number {
  const f = Object.hasOwn(table, unit) ? table[unit] : undefined;
  if (f === undefined) throw new UnitError(`Unknown unit: ${String(unit)}`);
  return f;
}

export function toKg(value: number, unit: WeightUnit): number {
  assertMeasurement(value);
  return value * factor(KG_PER, unit);
}

export function fromKg(kg: number, unit: WeightUnit): number {
  assertMeasurement(kg);
  return kg / factor(KG_PER, unit);
}

export function toMeters(value: number, unit: DistanceUnit): number {
  assertMeasurement(value);
  return value * factor(M_PER, unit);
}

export function fromMeters(m: number, unit: DistanceUnit): number {
  assertMeasurement(m);
  return m / factor(M_PER, unit);
}

export function toCm(value: number, unit: HeightUnit): number {
  assertMeasurement(value);
  return value * factor(CM_PER, unit);
}

export function fromCm(cm: number, unit: HeightUnit): number {
  assertMeasurement(cm);
  return cm / factor(CM_PER, unit);
}

export function isWeightUnit(u: string): u is WeightUnit {
  return (WEIGHT_UNITS as readonly string[]).includes(u);
}

export function isDistanceUnit(u: string): u is DistanceUnit {
  return (DISTANCE_UNITS as readonly string[]).includes(u);
}

export function isHeightUnit(u: string): u is HeightUnit {
  return (HEIGHT_UNITS as readonly string[]).includes(u);
}

/** Jump heights follow the weight preference: lb users think in inches. */
export function heightUnitFor(weightUnit: WeightUnit): HeightUnit {
  return weightUnit === "lb" ? "in" : "cm";
}

/**
 * Rounds half away from zero at `decimals` places. Goes through the decimal
 * string form so values like 1.005 (stored as 1.00499…) round as written.
 */
export function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) throw new UnitError("Value must be a finite number");
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 10) throw new UnitError("decimals must be 0–10");
  const sign = value < 0 ? -1 : 1;
  const rounded = shiftDecimal(Math.round(shiftDecimal(Math.abs(value), decimals)), -decimals);
  // Avoid returning -0.
  return rounded === 0 ? 0 : sign * rounded;
}

/** value × 10^places without binary multiplication error; copes with "1e-7"-style strings. */
function shiftDecimal(value: number, places: number): number {
  const [mantissa, exponent = "0"] = String(value).split("e");
  return Number(`${mantissa}e${Number(exponent) + places}`);
}

const SECONDS = /^\d+(\.\d+)?$/;
const MM_SS = /^(\d+):([0-5]\d(?:\.\d+)?)$/;
const H_MM_SS = /^(\d+):([0-5]\d):([0-5]\d(?:\.\d+)?)$/;

/**
 * Parses a duration typed by an athlete: `"12.4"` (seconds), `"mm:ss"` or
 * `"h:mm:ss"`, with optional fractional seconds. Seconds and minutes after
 * the first field must be two digits and below 60. Returns seconds.
 */
export function parseDuration(input: string): number {
  const s = input.trim();
  let m: RegExpExecArray | null;
  if (SECONDS.test(s)) return Number(s);
  if ((m = MM_SS.exec(s))) return Number(m[1]) * 60 + Number(m[2]);
  if ((m = H_MM_SS.exec(s))) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  throw new UnitError("Use seconds, mm:ss or h:mm:ss");
}

/** Formats whole seconds as `m:ss` or `h:mm:ss` (fractions are rounded). */
export function formatDuration(totalSeconds: number): string {
  assertMeasurement(totalSeconds);
  const t = Math.round(totalSeconds);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = String(t % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
