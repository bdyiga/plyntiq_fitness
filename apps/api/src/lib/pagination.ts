import { pageQuerySchema } from "@plyntiq/shared";
import type { Context } from "hono";
import { ValidationError } from "./http";

/**
 * Keyset pagination. The cursor is an opaque base64url encoding of the sort
 * key of the last row returned: [date, createdAt ms, id]. It carries no
 * ownership — queries still filter on the session's user ID, so a cursor
 * taken from another account reveals nothing.
 */
export type CursorKey = [string, number, string];

export function encodeCursor(key: CursorKey): string {
  return btoa(JSON.stringify(key)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeCursor(cursor: string): CursorKey {
  try {
    const key: unknown = JSON.parse(atob(cursor.replace(/-/g, "+").replace(/_/g, "/")));
    if (
      Array.isArray(key) &&
      key.length === 3 &&
      typeof key[0] === "string" &&
      Number.isSafeInteger(key[1]) &&
      typeof key[2] === "string"
    ) {
      return key as CursorKey;
    }
  } catch {
    // fall through to the validation error
  }
  throw new ValidationError([{ path: "cursor", message: "Invalid cursor" }]);
}

export interface PageQuery {
  limit: number;
  after: CursorKey | null;
}

export function parsePageQuery(c: Context): PageQuery {
  const result = pageQuerySchema.safeParse(c.req.query());
  if (!result.success) {
    throw new ValidationError(result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  return { limit: result.data.limit, after: result.data.cursor ? decodeCursor(result.data.cursor) : null };
}

/**
 * Callers fetch `limit + 1` rows; the extra row only signals that another
 * page exists. Returns the rows for this page and the cursor for the next.
 */
export function splitPage<R>(rows: R[], limit: number, keyOf: (row: R) => CursorKey) {
  const pageRows = rows.slice(0, limit);
  const last = pageRows.at(-1);
  return { pageRows, nextCursor: rows.length > limit && last ? encodeCursor(keyOf(last)) : null };
}
