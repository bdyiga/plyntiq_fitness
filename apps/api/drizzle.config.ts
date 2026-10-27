import { defineConfig } from "drizzle-kit";

// drizzle-kit only generates SQL here; Wrangler applies it (`wrangler d1 migrations apply`).
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema/index.ts",
  out: "./migrations",
});
