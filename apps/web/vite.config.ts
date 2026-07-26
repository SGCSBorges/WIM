import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
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
});
