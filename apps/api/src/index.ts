import { createApp } from "./app";
import { createDb } from "./db/client";
import { deleteExpiredPreviews } from "./modules/imports/import.repository";

const app = createApp();

export default {
  fetch: (request, env, ctx) => app.fetch(request, env, ctx),
  // Hourly cron (wrangler.jsonc): unconfirmed CSV import previews are deleted within 24 hours.
  scheduled: (_controller, env, ctx) => {
    ctx.waitUntil(deleteExpiredPreviews(createDb(env.DB)));
  },
} satisfies ExportedHandler<Env>;
