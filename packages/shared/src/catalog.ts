/**
 * Reference data shared by the API (seed migration + validation) and the web
 * app (onboarding). IDs are stable slugs; never rename an ID once shipped —
 * add a new one and deactivate the old one instead.
 */

export const SPORTS = [
  { id: "rugby_union", name: "Rugby union" },
  { id: "rugby_league", name: "Rugby league" },
  { id: "rugby_sevens", name: "Rugby sevens" },
  // For athletes whose sport isn't listed yet; analytics are goal-driven, so it works the same way.
  { id: "other", name: "Other / general athlete" },
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

export const EXERCISE_CATEGORIES = ["squat", "hinge", "lunge", "push", "pull", "jump", "carry", "other"] as const;
export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number];

/**
 * Global exercise catalog, seeded by migration (enforced by test). `isLowerBody`
 * feeds the M3 translation engine: lower-body strength and power are what
 * carry over to sprint and jump results.
 */
export const EXERCISES = [
  { id: "back_squat", name: "Back squat", category: "squat", isLowerBody: true },
  { id: "front_squat", name: "Front squat", category: "squat", isLowerBody: true },
  { id: "goblet_squat", name: "Goblet squat", category: "squat", isLowerBody: true },
  { id: "box_squat", name: "Box squat", category: "squat", isLowerBody: true },
  { id: "safety_bar_squat", name: "Safety bar squat", category: "squat", isLowerBody: true },
  { id: "deadlift", name: "Deadlift", category: "hinge", isLowerBody: true },
  { id: "sumo_deadlift", name: "Sumo deadlift", category: "hinge", isLowerBody: true },
  { id: "trap_bar_deadlift", name: "Trap bar deadlift", category: "hinge", isLowerBody: true },
  { id: "romanian_deadlift", name: "Romanian deadlift", category: "hinge", isLowerBody: true },
  { id: "hip_thrust", name: "Hip thrust", category: "hinge", isLowerBody: true },
  { id: "power_clean", name: "Power clean", category: "hinge", isLowerBody: true },
  { id: "hang_clean", name: "Hang clean", category: "hinge", isLowerBody: true },
  { id: "kettlebell_swing", name: "Kettlebell swing", category: "hinge", isLowerBody: true },
  { id: "nordic_curl", name: "Nordic hamstring curl", category: "hinge", isLowerBody: true },
  { id: "walking_lunge", name: "Walking lunge", category: "lunge", isLowerBody: true },
  { id: "reverse_lunge", name: "Reverse lunge", category: "lunge", isLowerBody: true },
  { id: "bulgarian_split_squat", name: "Bulgarian split squat", category: "lunge", isLowerBody: true },
  { id: "step_up", name: "Step-up", category: "lunge", isLowerBody: true },
  { id: "bench_press", name: "Bench press", category: "push", isLowerBody: false },
  { id: "incline_bench_press", name: "Incline bench press", category: "push", isLowerBody: false },
  { id: "overhead_press", name: "Overhead press", category: "push", isLowerBody: false },
  { id: "push_press", name: "Push press", category: "push", isLowerBody: false },
  { id: "dip", name: "Dip", category: "push", isLowerBody: false },
  { id: "push_up", name: "Push-up", category: "push", isLowerBody: false },
  { id: "pull_up", name: "Pull-up", category: "pull", isLowerBody: false },
  { id: "chin_up", name: "Chin-up", category: "pull", isLowerBody: false },
  { id: "barbell_row", name: "Barbell row", category: "pull", isLowerBody: false },
  { id: "dumbbell_row", name: "Dumbbell row", category: "pull", isLowerBody: false },
  { id: "inverted_row", name: "Inverted row", category: "pull", isLowerBody: false },
  { id: "box_jump", name: "Box jump", category: "jump", isLowerBody: true },
  { id: "broad_jump", name: "Broad jump", category: "jump", isLowerBody: true },
  { id: "countermovement_jump", name: "Countermovement jump", category: "jump", isLowerBody: true },
  { id: "depth_jump", name: "Depth jump", category: "jump", isLowerBody: true },
  { id: "farmers_carry", name: "Farmer's carry", category: "carry", isLowerBody: false },
  { id: "sled_push", name: "Sled push", category: "carry", isLowerBody: true },
  { id: "calf_raise", name: "Calf raise", category: "other", isLowerBody: true },
  { id: "plank", name: "Plank", category: "other", isLowerBody: false },
] as const satisfies readonly { id: string; name: string; category: ExerciseCategory; isLowerBody: boolean }[];
