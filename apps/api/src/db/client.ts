import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDb>;

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

/** True when a D1 error (possibly wrapped by Drizzle as `cause`) is the given SQLite constraint failure. */
export function isConstraintError(err: unknown, kind: "UNIQUE" | "FOREIGN KEY"): boolean {
  for (let e: unknown = err; e instanceof Error; e = e.cause) {
    if (e.message.includes(`${kind} constraint failed`)) return true;
  }
  return false;
}
