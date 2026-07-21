import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    // Local dev: proxy API + files to the running api container/process.
    proxy: {
      "/api": { target: "http://localhost:8080", changeOrigin: true },
      "/files": { target: "http://localhost:8080", changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
});
