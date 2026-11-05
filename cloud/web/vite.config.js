import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Dev: proxy /api to the cloud API (npm run dev in ../api, port 8787).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": "http://localhost:8787" } },
});
