import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    // `npm run dev:phone` serves the dev app through a Cloudflare quick tunnel.
    allowedHosts: [".trycloudflare.com"],
    // Same-origin in dev too: the browser only ever talks to :5173.
    // Through the tunnel, the Host header must not be the tunnel hostname: wrangler's dev
    // proxy rewrites header URLs on that host to http://, turning a valid https Origin invalid.
    proxy: { "/api": { target: "http://localhost:8787", changeOrigin: process.env.PLYNTIQ_TUNNEL === "1" } },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
  },
});
