import type { AssessmentResultDto, ConditioningSessionDto, Page, WorkoutDto } from "@plyntiq/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ME, mockApi, type MockRequest } from "./mock-api";
import { renderRoute } from "./render";

afterEach(() => vi.restoreAllMocks());

function workout(id: string, workoutDate: string): WorkoutDto {
  return {
    id,
    workoutDate,
    notes: null,
    createdAt: `${workoutDate}T10:00:00Z`,
    updatedAt: `${workoutDate}T10:00:00Z`,
    sets: [
      { id: `${id}-1`, exerciseId: "back_squat", exerciseName: "Back squat", setIndex: 0, reps: 5, loadValue: 100, loadUnit: "kg", loadKg: 100, rpe: null },
      { id: `${id}-2`, exerciseId: "back_squat", exerciseName: "Back squat", setIndex: 1, reps: 3, loadValue: 110, loadUnit: "kg", loadKg: 110, rpe: 9 },
      { id: `${id}-3`, exerciseId: "pull_up", exerciseName: "Pull-up", setIndex: 2, reps: 8, loadValue: 0, loadUnit: "kg", loadKg: 0, rpe: null },
    ],
  };
}

const SESSION: ConditioningSessionDto = {
  id: "c1",
  sessionDate: "2026-10-19",
  type: "intervals",
  durationS: 1290,
  distanceValue: 3.2,
  distanceUnit: "km",
  distanceM: 3200,
  sessionRpe: 7,
  notes: null,
  createdAt: "2026-10-19T10:00:00Z",
  updatedAt: "2026-10-19T10:00:00Z",
};

const SPRINT: AssessmentResultDto = {
  id: "a1",
  definitionId: "sprint_20m",
  assessedOn: "2026-10-18",
  value: 3.12,
  unit: "s",
  valueCanonical: 3.12,
  method: "timing_gates",
  surface: "grass",
  footwear: "boots",
  conditionsNote: "Light headwind",
  notes: null,
  createdAt: "2026-10-18T10:00:00Z",
  updatedAt: "2026-10-18T10:00:00Z",
};

describe("HistoryPage", () => {
  it("lists workouts with a per-exercise summary and loads more pages", async () => {
    const api = mockApi({
      "GET /api/me": ME,
      "GET /api/workouts": ({ url }: MockRequest): Page<WorkoutDto> =>
        url.searchParams.get("cursor") === "next"
          ? { items: [workout("w2", "2026-10-01")], nextCursor: null }
          : { items: [workout("w1", "2026-10-20")], nextCursor: "next" },
    });
    renderRoute("/history");
    const user = userEvent.setup();

    expect(await screen.findByText("Back squat · 2 sets · best 110 kg × 3")).toBeInTheDocument();
    expect(screen.getByText("Pull-up · 1 set")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Workouts" })).toHaveAttribute("aria-selected", "true");

    await user.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(screen.getAllByRole("link", { name: "Edit" })).toHaveLength(2));
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Edit" })[1]).toHaveAttribute("href", "/workouts/w2/edit");
    expect(api.sent("GET", "/api/workouts").map((c) => c.url.searchParams.get("limit"))).toEqual(["20", "20"]);
  });

  it("deletes only after confirmation, then refreshes the list", async () => {
    let items = [workout("w1", "2026-10-20")];
    const api = mockApi({
      "GET /api/me": ME,
      "GET /api/workouts": () => ({ items, nextCursor: null }),
      "DELETE /api/workouts/w1": () => {
        items = [];
        return null;
      },
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderRoute("/history?tab=workouts");
    const user = userEvent.setup();

    const del = await screen.findByRole("button", { name: "Delete" });
    await user.click(del);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(api.sent("DELETE", "/api/workouts/w1")).toHaveLength(0);

    await user.click(del);
    await waitFor(() => expect(api.sent("DELETE", "/api/workouts/w1")).toHaveLength(1));
    expect(await screen.findByText("No workouts yet.")).toBeInTheDocument();
  });

  it("shows an error when a delete fails", async () => {
    mockApi({
      "GET /api/me": ME,
      "GET /api/workouts": { items: [workout("w1", "2026-10-20")], nextCursor: null },
      "DELETE /api/workouts/w1": Response.json({ error: { code: "internal_error", message: "x" } }, { status: 500 }),
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderRoute("/history");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't delete that workout.");
  });

  it("switches between conditioning and assessment tabs", async () => {
    mockApi({
      "GET /api/me": ME,
      "GET /api/workouts": { items: [], nextCursor: null },
      "GET /api/conditioning": { items: [SESSION], nextCursor: null },
      "GET /api/assessments": { items: [SPRINT], nextCursor: null },
    });
    const { router } = renderRoute("/history");
    const user = userEvent.setup();
    expect(await screen.findByText("No workouts yet.")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Conditioning" }));
    expect(await screen.findByText("21:30 · 3.2 km · RPE 7")).toBeInTheDocument();
    expect(router.state.location.search).toBe("?tab=conditioning");
    expect(screen.getByRole("link", { name: "Log conditioning" })).toHaveAttribute("href", "/conditioning/new");

    await user.click(screen.getByRole("tab", { name: "Assessments" }));
    const panel = await screen.findByRole("tabpanel", { name: "Assessments" });
    expect(await within(panel).findByText(/20 m sprint/)).toBeInTheDocument();
    expect(within(panel).getByText("3.12 s")).toBeInTheDocument();
    expect(within(panel).getByText(/Timing gates/)).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "Edit" })).toHaveAttribute("href", "/assessments/a1/edit");
  });
});

describe("ConditioningFormPage", () => {
  it("parses mm:ss and defaults the distance unit to the profile's", async () => {
    const api = mockApi({
      "GET /api/me": ME,
      "POST /api/conditioning": ({ body }: MockRequest) => ({ session: { ...SESSION, ...(body as object) } }),
    });
    const { router } = renderRoute("/conditioning/new");
    const user = userEvent.setup();

    expect(await screen.findByLabelText("Unit")).toHaveValue("km");
    await user.type(screen.getByLabelText("Duration (mm:ss or h:mm:ss)"), "1:61");
    await user.click(screen.getByRole("button", { name: "Save session" }));
    expect(await screen.findByText("Use seconds, mm:ss or h:mm:ss")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Duration (mm:ss or h:mm:ss)"));
    await user.type(screen.getByLabelText("Duration (mm:ss or h:mm:ss)"), "21:30");
    await user.type(screen.getByLabelText("Distance (optional)"), "3.2");
    await user.selectOptions(screen.getByLabelText(/RPE 0–10/), "7");
    await user.click(screen.getByRole("button", { name: "Save session" }));

    await waitFor(() => expect(router.state.location.search).toBe("?tab=conditioning"));
    expect(api.sent("POST", "/api/conditioning")[0]!.body).toMatchObject({
      type: "run",
      durationS: 1290,
      distanceValue: 3.2,
      distanceUnit: "km",
      sessionRpe: 7,
    });
  });
});

describe("AssessmentFormPage", () => {
  it("defaults the method and conditions to the previous result and the jump unit to the profile", async () => {
    const api = mockApi({
      "GET /api/me": ME,
      "GET /api/assessments": ({ url }: MockRequest) => ({
        items: url.searchParams.get("definitionId") === "sprint_20m" ? [SPRINT] : [],
        nextCursor: null,
      }),
      "POST /api/assessments": ({ body }: MockRequest) => ({ result: { ...SPRINT, ...(body as object) } }),
    });
    renderRoute("/assessments/new");
    const user = userEvent.setup();

    expect(await screen.findByLabelText("How was it measured?")).toHaveValue("timing_gates");
    expect(screen.getByLabelText("Surface")).toHaveValue("grass");
    await user.type(screen.getByLabelText("Time"), "3.05");
    await user.click(screen.getByRole("button", { name: "Save result" }));
    await waitFor(() => expect(api.sent("POST", "/api/assessments")).toHaveLength(1));
    expect(api.sent("POST", "/api/assessments")[0]!.body).toMatchObject({
      definitionId: "sprint_20m",
      value: 3.05,
      unit: "s",
      method: "timing_gates",
      surface: "grass",
      footwear: "boots",
    });
  });

  it("offers only jump methods for a jump and rejects implausible values", async () => {
    const api = mockApi({ "GET /api/me": ME, "GET /api/assessments": { items: [], nextCursor: null } });
    renderRoute("/assessments/new?test=vertical_jump");
    const user = userEvent.setup();

    const method = await screen.findByLabelText("How was it measured?");
    const options = within(method).getAllByRole("option").map((o) => o.getAttribute("value"));
    expect(options).toEqual(["", "jump_mat", "force_plate", "video_app", "wall_reach", "other"]);
    expect(screen.getByLabelText("Unit")).toHaveValue("in");

    await user.type(screen.getByLabelText("Jump height"), "200");
    await user.click(screen.getByRole("button", { name: "Save result" }));
    expect(await screen.findByText("Choose how it was measured")).toBeInTheDocument();

    // Definition rules (range, method fit) run once the basic fields are valid.
    await user.selectOptions(method, "jump_mat");
    await user.click(screen.getByRole("button", { name: "Save result" }));
    expect(await screen.findByText(/Expected 5–150 cm/)).toBeInTheDocument();
    expect(api.sent("POST", "/api/assessments")).toHaveLength(0);
  });
});
