import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `base: "/static/"` so the built HTML references `/static/assets/*.js` —
// those map directly to STATICFILES_DIRS in Django settings and are served
// by WhiteNoise. The SPA shell (index.html) is served by Django's catch-all
// view, so React Router owns all non-/api routes.
export default defineConfig({
  plugins: [react()],
  base: "/static/",
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
