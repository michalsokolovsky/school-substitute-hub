import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";

export default defineConfig(({ command }) => ({
  server: { host: "::", port: 8080 },
  resolve: {
    alias: { "@": `${process.cwd()}/src` },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
    ],
    ignoreOutdatedRequests: true,
  },
  plugins: [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
      server: { entry: "server" },
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
    }),
    // Deploy adapter, build only. Targets Cloudflare unless a preset is passed.
    // vercel.config.crons: a daily reminder to the admins about requests waiting over a day
    // (UTC, Sunday to Thursday). Only the Vercel preset reads it; it needs CRON_SECRET to be set.
    ...(command === "build"
      ? [
          nitro({
            defaultPreset: "cloudflare-module",
            vercel: {
              config: {
                version: 3,
                crons: [{ path: "/api/cron/pending-reminder", schedule: "0 5 * * 0-4" }],
              },
            },
          }),
        ]
      : []),
    viteReact(),
  ],
}));
