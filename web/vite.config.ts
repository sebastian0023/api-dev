import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Overridable so the same config works both on the host (api on
// localhost:3000) and inside docker-compose (api reachable by service
// name only — see the `web` service's API_PROXY_TARGET in
// docker-compose.yml).
const apiProxyTarget = process.env.API_PROXY_TARGET ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": { target: apiProxyTarget, changeOrigin: true },
    },
  },
});
