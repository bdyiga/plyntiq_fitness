# Deployment

Requires a Cloudflare account on the **Workers Paid** plan ([ADR 0003](adr/0003-password-hashing-cpu.md)).

```bash
cd apps/api
npx wrangler login
npx wrangler d1 create plyntiq          # copy database_id into wrangler.jsonc
npx wrangler secret put BETTER_AUTH_SECRET   # openssl rand -base64 32
```

Before the first deploy, set the production vars in `wrangler.jsonc` (or in an `env.production` block): `ENVIRONMENT=production`, and `APP_ORIGIN` / `BETTER_AUTH_URL` set to your `https://` origin.

```bash
npm run db:migrate:remote --workspace @plyntiq/api
npm run deploy --workspace @plyntiq/api   # builds the SPA, then wrangler deploy
```

Automated deploys from GitHub Actions (using `CLOUDFLARE_API_TOKEN` and the `wrangler-action`) are planned for M6.
