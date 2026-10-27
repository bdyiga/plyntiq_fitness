import type { ExerciseDto, Page, WorkoutDto } from "@plyntiq/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EXERCISES, ME, mockApi } from "./mock-api";
import { renderRoute } from "./render";

afterEach(() => vi.restoreAllMocks());

const LAST_WORKOUT: WorkoutDto = {
  id: "w-last",
  workoutDate: "2026-10-20",
  notes: null,
  createdAt: "2026-10-20T10:00:00Z",
  updatedAt: "2026-10-20T10:00:00Z",
  sets: [
    { id: "s1", exerciseId: "back_squat", exerciseName: "Back squat", setIndex: 0, reps: 5, loadValue: 225, loadUnit: "lb", loadKg: 102.06, rpe: 8 },
    { id: "s2", exerciseId: "deadlift", exerciseName: "Deadlift", setIndex: 1, reps: 3, loadValue: 140, loadUnit: "kg", loadKg: 140, rpe: null },
  ],
};

function routes(lastWorkouts: WorkoutDto[] = []) {
  return {
    "GET /api/me": ME,
    "GET /api/exercises": { exercises: EXERCISES },
    "GET /api/workouts": { items: lastWorkouts, nextCursor: null } satisfies Page<WorkoutDto>,
    "POST /api/workouts": ({ body }: { body: unknown }) => ({ workout: { ...LAST_WORKOUT, ...(body as object), id: "w-new" } }),
  };
}

describe("WorkoutLoggerPage", () => {
  it("quick-adds sets, copying the previous set and defaulting to the profile's unit", async () => {
    const api = mockApi(routes());
    const { router } = renderRoute("/workouts/new");
    const user = userEvent.setup();

    await screen.findByRole("heading", { name: "Log workout" });
    expect(screen.queryByRole("button", { name: "Repeat last workout" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add set" }));
    const first = screen.getByRole("listitem", { name: "Set 1: Back squat" });
    expect(within(first).getByLabelText("Set 1 unit")).toHaveValue("lb");
    const reps = within(first).getByLabelText("Set 1 Reps");
    await user.clear(reps);
    await user.type(reps, "3");
    await user.type(within(first).getByLabelText("Set 1 Load"), "315");
    await user.type(within(first).getByLabelText("Set 1 RPE"), "8.5");

    // The next set of the same exercise is one tap.
    await user.click(screen.getByRole("button", { name: "Add set" }));
    const second = screen.getByRole("listitem", { name: "Set 2: Back squat" });
    expect(within(second).getByLabelText("Set 2 Load")).toHaveValue("315");

    await user.selectOptions(screen.getByLabelText("Exercise"), "bench_press");
    await user.click(screen.getByRole("button", { name: "Add set" }));
    const third = screen.getByRole("listitem", { name: "Set 3: Bench press" });
    await user.type(within(third).getByLabelText("Set 3 Load"), "185");
    await user.click(screen.getByRole("button", { name: "Remove set 2" }));

    await user.click(screen.getByRole("button", { name: "Save workout" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/history"));
    expect(router.state.location.search).toBe("?tab=workouts");

    const [post] = api.sent("POST", "/api/workouts");
    expect(post!.body).toMatchObject({
      notes: null,
      sets: [
        { exerciseId: "back_squat", reps: 3, loadValue: 315, loadUnit: "lb", rpe: 8.5 },
        { exerciseId: "bench_press", reps: 5, loadValue: 185, loadUnit: "lb", rpe: null },
      ],
    });
    expect((post!.body as { workoutDate: string }).workoutDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("repeats the last workout's sets", async () => {
    const api = mockApi(routes([LAST_WORKOUT]));
    renderRoute("/workouts/new");
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Repeat last workout" }));
    expect(screen.getByRole("listitem", { name: "Set 1: Back squat" })).toBeInTheDocument();
    expect(screen.getByLabelText("Set 2 Load")).toHaveValue("140");
    expect(screen.getByLabelText("Set 2 unit")).toHaveValue("kg");

    await user.click(screen.getByRole("button", { name: "Save workout" }));
    await waitFor(() => expect(api.sent("POST", "/api/workouts")).toHaveLength(1));
    expect(api.sent("POST", "/api/workouts")[0]!.body).toMatchObject({
      sets: [
        { exerciseId: "back_squat", reps: 5, loadValue: 225, loadUnit: "lb", rpe: 8 },
        { exerciseId: "deadlift", reps: 3, loadValue: 140, loadUnit: "kg", rpe: null },
      ],
    });
  });

  it("asks before replacing sets already entered", async () => {
    mockApi(routes([LAST_WORKOUT]));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderRoute("/workouts/new");
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Add set" }));
    await user.click(screen.getByRole("button", { name: "Repeat last workout" }));
    expect(confirm).toHaveBeenCalled();
    expect(screen.getAllByRole("listitem", { name: /^Set \d/ })).toHaveLength(1);
  });

  it("shows validation errors without calling the API", async () => {
    const api = mockApi(routes());
    renderRoute("/workouts/new");
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Save workout" }));
    expect(await screen.findByText("Add at least one set")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add set" }));
    await user.type(screen.getByLabelText("Set 1 RPE"), "12");
    await user.click(screen.getByRole("button", { name: "Save workout" }));
    expect(await screen.findByText(/Enter a load \(0 for bodyweight\)/)).toBeInTheDocument();
    expect(screen.getByText(/RPE must be 1–10/)).toBeInTheDocument();
    expect(api.sent("POST", "/api/workouts")).toHaveLength(0);
  });

  it("shows server-side errors next to the fields", async () => {
    mockApi({
      ...routes(),
      "POST /api/workouts": Response.json(
        {
          error: {
            code: "validation_failed",
            message: "Request validation failed",
            issues: [{ path: "sets.0.exerciseId", message: "Unknown exercise" }],
          },
        },
        { status: 400 },
      ),
    });
    renderRoute("/workouts/new");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Add set" }));
    await user.type(screen.getByLabelText("Set 1 Load"), "100");
    await user.click(screen.getByRole("button", { name: "Save workout" }));
    expect(await screen.findByText("Unknown exercise")).toBeInTheDocument();
  });

  it("edits an existing workout with PATCH", async () => {
    const api = mockApi({
      ...routes(),
      "GET /api/workouts/w-last": { workout: LAST_WORKOUT },
      "PATCH /api/workouts/w-last": ({ body }: { body: unknown }) => ({ workout: { ...LAST_WORKOUT, ...(body as object) } }),
    });
    renderRoute("/workouts/w-last/edit");
    const user = userEvent.setup();

    await screen.findByRole("heading", { name: "Edit workout" });
    expect(screen.queryByRole("button", { name: "Repeat last workout" })).not.toBeInTheDocument();
    const load = screen.getByLabelText("Set 1 Load");
    await user.clear(load);
    await user.type(load, "235");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(api.sent("PATCH", "/api/workouts/w-last")).toHaveLength(1));
    expect(api.sent("PATCH", "/api/workouts/w-last")[0]!.body).toMatchObject({
      workoutDate: "2026-10-20",
      sets: [{ loadValue: 235 }, { loadValue: 140 }],
    });
  });

  it("adds a custom exercise and selects it", async () => {
    const custom: ExerciseDto = { id: "c1", name: "Landmine press", category: "push", isLowerBody: false, isCustom: true };
    let exercises = EXERCISES;
    const api = mockApi({
      ...routes(),
      "GET /api/exercises": () => ({ exercises }),
      "POST /api/exercises": () => {
        exercises = [...EXERCISES, custom];
        return { exercise: custom };
      },
    });
    renderRoute("/workouts/new");
    const user = userEvent.setup();

    await user.click(await screen.findByText("Can't find it? Add your own exercise"));
    await user.type(screen.getByLabelText("Exercise name"), "Landmine press");
    await user.selectOptions(screen.getByLabelText("Movement"), "push");
    await user.click(screen.getByRole("button", { name: "Add exercise" }));

    await waitFor(() => expect(screen.getByLabelText("Exercise")).toHaveValue("c1"));
    expect(api.sent("POST", "/api/exercises")[0]!.body).toEqual({ name: "Landmine press", category: "push", isLowerBody: false });
  });
});
