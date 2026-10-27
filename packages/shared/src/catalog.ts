/**
 * Reference data shared by the API (seed migration + validation) and the web
 * app (onboarding). IDs are stable slugs; never rename an ID once shipped —
 * add a new one and deactivate the old one instead.
 */

export const SPORTS = [
  { id: "rugby_union", name: "Rugby union" },
  { id: "rugby_league", name: "Rugby league" },
  { id: "rugby_sevens", name: "Rugby sevens" },
] as const;

export type SportId = (typeof SPORTS)[number]["id"];

/**
 * Goals are sport-independent: a rugby player and a basketball player who both
 * pick "acceleration" use the same analytics.
 */
export const ATHLETIC_GOALS = [
  { id: "acceleration", name: "Improve acceleration", quality: "speed" },
  { id: "max_strength", name: "Build maximal strength", quality: "strength" },
  { id: "lower_body_power", name: "Increase lower-body power", quality: "power" },
  { id: "conditioning", name: "Improve conditioning", quality: "conditioning" },
] as const;

export type AthleticGoalId = (typeof ATHLETIC_GOALS)[number]["id"];

export const WEIGHT_UNITS = ["kg", "lb"] as const;
export type WeightUnit = (typeof WEIGHT_UNITS)[number];

export const DISTANCE_UNITS = ["m", "km", "mi"] as const;
export type DistanceUnit = (typeof DISTANCE_UNITS)[number];
