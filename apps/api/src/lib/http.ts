import type { ApiError } from "@plyntiq/shared";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { z } from "zod";

export function apiError(
  c: Context,
  status: ContentfulStatusCode,
  code: string,
  message: string,
  issues?: ApiError["error"]["issues"],
) {
  return c.json<ApiError>({ error: { code, message, ...(issues ? { issues } : {}) } }, status);
}

export class ValidationError extends HTTPException {
  constructor(readonly issues: { path: string; message: string }[]) {
    super(400, { message: "Request validation failed" });
  }
}

/** Parse a JSON body against a Zod schema, throwing a 400 with field issues. */
export async function parseJson<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new ValidationError([{ path: "", message: "Body must be valid JSON" }]);
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  return result.data;
}
