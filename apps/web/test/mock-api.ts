import type { ExerciseDto, MeDto } from "@plyntiq/shared";
import { vi } from "vitest";

export interface MockRequest {
  method: string;
  url: URL;
  body: unknown;
}

/** A canned JSON body, a function of the request, a Response, or null for 204. */
type Route = unknown | ((req: MockRequest) => unknown);

/**
 * Stubs fetch with routes keyed by "METHOD /path" (query strings ignored for
 * matching; handlers can read `url.searchParams`). Unmatched requests get a
 * 404 so a missing mock fails loudly. Every request is recorded in `calls`.
 */
export function mockApi(routes: Record<string, Route>) {
  const calls: MockRequest[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(String(input), "http://localhost");
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const req = { method, url, body };
    calls.push(req);
    const route = routes[`${method} ${url.pathname}`];
    if (route === undefined) {
      return Response.json({ error: { code: "not_found", message: `No mock for ${method} ${url.pathname}` } }, { status: 404 });
    }
    const result = typeof route === "function" ? await route(req) : route;
    if (result instanceof Response) return result;
    if (result === null) return new Response(null, { status: 204 });
    return Response.json(result);
  });
  return { calls, sent: (method: string, path: string) => calls.filter((c) => c.method === method && c.url.pathname === path) };
}

export const ME: MeDto = {
  user: { id: "u1", name: "Alex", email: "alex@example.com", emailVerified: false, createdAt: "2026-10-01T00:00:00Z" },
  profile: {
    primarySportId: "rugby_union",
    primaryGoalId: "acceleration",
    preferredWeightUnit: "lb",
    preferredDistanceUnit: "km",
    onboardingCompletedAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
  },
};

export const EXERCISES: ExerciseDto[] = [
  { id: "back_squat", name: "Back squat", category: "squat", isLowerBody: true, isCustom: false },
  { id: "bench_press", name: "Bench press", category: "push", isLowerBody: false, isCustom: false },
  { id: "deadlift", name: "Deadlift", category: "hinge", isLowerBody: true, isCustom: false },
];
