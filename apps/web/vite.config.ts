import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // Attachment URLs are minted on APP_URL — the web origin — and production
  // forwards /uploads/* to the API (render.yaml, public/_redirects). Do the
  // same under `vite` and `vite preview` so documents open locally too.
  const apiBase = loadEnv(mode, process.cwd(), "VITE_").VITE_API_BASE_URL;
  const apiOrigin = /^https?:\/\//i.test(apiBase ?? "")
    ? new URL(apiBase).origin
    : "http://localhost:3000";
  const proxy = { "/uploads": { target: apiOrigin, changeOrigin: true } };

  return {
    plugins: [react()],
    server: { port: 5173, proxy },
    preview: { proxy },
    build: {
      rollupOptions: {
        output: {
          // Split the long-stable framework code into its own chunk so the
          // per-route lazy chunks stay small. Long cache lifetimes for
          // `vendor`, route bundles re-fetch only when their own code changes.
          manualChunks: {
            vendor: ["react", "react-dom", "react-router"],
            "date-fns": ["date-fns"],
            zod: ["zod"],
          },
        },
      },
    },
  };
});
