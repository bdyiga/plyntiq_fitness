import { describe, expect, it } from "vitest";
import { neutralizeFormula, restoreFormulaText, toCsv } from "./csv";

describe("CSV writer", () => {
  it("writes a BOM, CRLF lines and empty cells for null", () => {
    expect(toCsv(["a", "b"], [[1, null], ["x", 2.5]])).toBe("﻿a,b\r\n1,\r\nx,2.5\r\n");
  });

  it("quotes commas, quotes, line breaks and edge whitespace", () => {
    const csv = toCsv(["notes"], [["Squats, then sprints"], ['Said "easy"'], ["line 1\nline 2"], [" padded"]]);
    expect(csv.split("\r\n").slice(1, -1)).toEqual([
      '"Squats, then sprints"',
      '"Said ""easy"""',
      '"line 1\nline 2"',
      '" padded"',
    ]);
  });

  it.each(["=HYPERLINK(\"http://evil\")", "+1+1", "-2+3", "@SUM(A1)", "\tcmd", "\rcmd"])(
    "neutralizes formula-like text %j",
    (cell) => {
      const line = toCsv(["notes"], [[cell]]).split("\r\n")[1]!;
      expect(line.replace(/^"/, "").startsWith("'")).toBe(true);
    },
  );

  it("does not escape numbers, including negatives", () => {
    expect(toCsv(["n"], [[-5]]).split("\r\n")[1]).toBe("-5");
  });

  it("round-trips neutralized text on import", () => {
    for (const text of ["=1+1", "-5 sets", "@coach", "normal", "'quoted already"]) {
      expect(restoreFormulaText(neutralizeFormula(text))).toBe(text);
    }
  });
});
