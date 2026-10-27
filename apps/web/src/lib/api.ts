import type { ApiError, MeDto, UpsertProfileInput } from "@plyntiq/shared";

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError | null,
  ) {
    super(body?.error.message ?? `Request failed (${status})`);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    throw new ApiRequestError(res.status, body);
  }
  return (await res.json()) as T;
}

export const api = {
  me: () => request<MeDto>("/api/me"),
  saveProfile: (input: UpsertProfileInput) =>
    request<{ profile: MeDto["profile"] }>("/api/me/profile", { method: "PUT", body: JSON.stringify(input) }),
};

export const queryKeys = {
  me: ["me"] as const,
};
