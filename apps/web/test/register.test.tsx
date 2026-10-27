import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderRoute } from "./render";

afterEach(() => vi.restoreAllMocks());

describe("RegisterPage", () => {
  it("blocks submission until adult and privacy confirmations are checked", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderRoute("/register");
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Name"), "Test Athlete");
    await user.type(screen.getByLabelText("Email"), "athlete@example.com");
    await user.type(screen.getByLabelText("Password"), "a-long-enough-password");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("You must be 18 or older to use Plyntiq")).toBeInTheDocument();
    expect(screen.getByText("You must accept the privacy notice")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows a password length error", async () => {
    renderRoute("/register");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Password"), "short");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("Use at least 12 characters")).toBeInTheDocument();
  });
});

describe("RequireAuth", () => {
  it("redirects signed-out visitors from the dashboard to login", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "unauthenticated", message: "Sign in" } }), { status: 401 }),
    );
    const { router } = renderRoute("/dashboard");
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("sends signed-in athletes without a profile to onboarding", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          user: { id: "u1", name: "A", email: "a@example.com", emailVerified: false, createdAt: "2026-10-26T00:00:00Z" },
          profile: null,
        }),
        { status: 200 },
      ),
    );
    const { router } = renderRoute("/dashboard");
    await waitFor(() => expect(router.state.location.pathname).toBe("/onboarding"));
  });
});
