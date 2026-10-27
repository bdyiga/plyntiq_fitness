import { describe, expect, it } from "vitest";
import { addDays, DateError, daysBetween, isoWeek, weekStart, weeksInRange } from "./dates";

describe("ISO weeks", () => {
  it("starts weeks on Monday", () => {
    expect(weekStart("2026-10-27")).toBe("2026-10-26"); // Tuesday
    expect(weekStart("2026-10-26")).toBe("2026-10-26"); // Monday
    expect(weekStart("2026-11-01")).toBe("2026-10-26"); // Sunday
  });

  it("assigns weeks across a year boundary to the year of their Thursday", () => {
    expect(isoWeek("2026-01-01")).toBe("2026-W01"); // Thursday
    expect(isoWeek("2027-01-01")).toBe("2026-W53"); // Friday: 2026 has 53 ISO weeks
    expect(isoWeek("2027-01-04")).toBe("2027-W01");
    expect(isoWeek("2024-12-30")).toBe("2025-W01"); // Monday belongs to 2025
    expect(weekStart("2027-01-01")).toBe("2026-12-28");
  });

  it("is unaffected by daylight-saving changes", () => {
    // US and EU clocks change on these dates; calendar-day arithmetic must not.
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29");
  });

  it("lists every week in a range, inclusive", () => {
    expect(weeksInRange("2026-10-28", "2026-11-10")).toEqual(["2026-10-26", "2026-11-02", "2026-11-09"]);
    expect(weeksInRange("2026-10-28", "2026-10-28")).toEqual(["2026-10-26"]);
    expect(() => weeksInRange("2026-11-01", "2026-10-01")).toThrow(DateError);
  });

  it("rejects impossible or malformed dates", () => {
    expect(() => weekStart("2026-02-30")).toThrow(DateError);
    expect(() => weekStart("2026-2-3")).toThrow(DateError);
    expect(() => addDays("not a date", 1)).toThrow(DateError);
  });
});
