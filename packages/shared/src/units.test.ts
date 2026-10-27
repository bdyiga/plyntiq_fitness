import { describe, expect, it } from "vitest";
import {
  formatDuration,
  fromCm,
  fromKg,
  fromMeters,
  heightUnitFor,
  parseDuration,
  roundTo,
  toCm,
  toKg,
  toMeters,
  UnitError,
} from "./units";

describe("weight", () => {
  it("converts known values exactly", () => {
    expect(toKg(1, "lb")).toBe(0.45359237);
    expect(roundTo(fromKg(100, "kg"), 3)).toBe(100);
    expect(roundTo(fromKg(100, "lb"), 3)).toBe(220.462);
    expect(roundTo(toKg(225, "lb"), 3)).toBe(102.058);
    expect(toKg(0, "lb")).toBe(0);
  });

  it("round-trips back to the original value", () => {
    for (const lb of [0, 1, 45, 135, 225, 315, 405, 2.5, 1003.7]) {
      expect(fromKg(toKg(lb, "lb"), "lb")).toBeCloseTo(lb, 9);
    }
  });
});

describe("distance", () => {
  it("converts known values exactly", () => {
    expect(toMeters(1, "mi")).toBe(1609.344);
    expect(toMeters(5, "km")).toBe(5000);
    expect(toMeters(400, "m")).toBe(400);
    expect(fromMeters(1609.344, "mi")).toBe(1);
    expect(fromMeters(1500, "km")).toBe(1.5);
  });

  it("round-trips back to the original value", () => {
    for (const mi of [0.25, 1, 3.1, 26.2188]) {
      expect(fromMeters(toMeters(mi, "mi"), "mi")).toBeCloseTo(mi, 9);
    }
  });
});

describe("height", () => {
  it("converts known values exactly", () => {
    expect(toCm(1, "in")).toBe(2.54);
    expect(toCm(24, "in")).toBeCloseTo(60.96, 10);
    expect(fromCm(254, "in")).toBe(100);
  });

  it("round-trips back to the original value", () => {
    for (const inches of [18.5, 24, 30.25, 41]) {
      expect(fromCm(toCm(inches, "in"), "in")).toBeCloseTo(inches, 9);
    }
  });

  it("derives the jump unit from the weight preference", () => {
    expect(heightUnitFor("kg")).toBe("cm");
    expect(heightUnitFor("lb")).toBe("in");
  });
});

describe("invalid input", () => {
  it("rejects negative, non-finite and non-numeric values", () => {
    expect(() => toKg(-1, "kg")).toThrow(UnitError);
    expect(() => toKg(Number.NaN, "kg")).toThrow(UnitError);
    expect(() => toMeters(Number.POSITIVE_INFINITY, "m")).toThrow(UnitError);
    expect(() => toCm("10" as unknown as number, "cm")).toThrow(UnitError);
  });

  it("rejects unknown units, including prototype keys", () => {
    expect(() => toKg(1, "stone" as never)).toThrow(UnitError);
    expect(() => toMeters(1, "toString" as never)).toThrow(UnitError);
    expect(() => toCm(1, "ft" as never)).toThrow(UnitError);
  });
});

describe("durations", () => {
  it("parses seconds, mm:ss and h:mm:ss", () => {
    expect(parseDuration("45")).toBe(45);
    expect(parseDuration("3.12")).toBe(3.12);
    expect(parseDuration(" 1:30 ")).toBe(90);
    expect(parseDuration("0:03.05")).toBeCloseTo(3.05, 10);
    expect(parseDuration("75:00")).toBe(4500);
    expect(parseDuration("1:02:03")).toBe(3723);
    expect(parseDuration("0:00")).toBe(0);
  });

  it("rejects malformed durations", () => {
    for (const bad of ["", "abc", "-5", "1:60", "1:5", ":30", "1:", "1:00:60", "1:60:00", "1:2:3:4", "1e3", "1,5"]) {
      expect(() => parseDuration(bad), bad).toThrow(UnitError);
    }
  });

  it("formats durations", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(90)).toBe("1:30");
    expect(formatDuration(3723)).toBe("1:02:03");
    expect(formatDuration(59.6)).toBe("1:00");
    expect(parseDuration(formatDuration(4500))).toBe(4500);
  });
});

describe("roundTo", () => {
  it("rounds half away from zero, as written in decimal", () => {
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(2.675, 2)).toBe(2.68);
    expect(roundTo(-2.5, 0)).toBe(-3);
    expect(roundTo(0.5, 0)).toBe(1);
    expect(roundTo(220.4622621848776, 1)).toBe(220.5);
  });

  it("handles zero, tiny and large values", () => {
    expect(Object.is(roundTo(-0.0001, 2), 0)).toBe(true);
    expect(roundTo(1e-7, 3)).toBe(0);
    expect(roundTo(123456789.125, 2)).toBe(123456789.13);
    expect(roundTo(5, 0)).toBe(5);
  });

  it("rejects bad arguments", () => {
    expect(() => roundTo(Number.NaN, 2)).toThrow(UnitError);
    expect(() => roundTo(1, -1)).toThrow(UnitError);
    expect(() => roundTo(1, 1.5)).toThrow(UnitError);
  });
});
