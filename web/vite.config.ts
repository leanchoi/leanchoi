import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base: './'` hace que el build sea servible desde cualquier subruta del VPS
// (p. ej. https://dominio/turismo/) sin recompilar.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          // DuckDB pesa lo suyo: en su propio chunk se cachea aparte del código
          // de la app, que cambia mucho más seguido.
          duckdb: ['@duckdb/duckdb-wasm'],
          d3: ['d3-array', 'd3-scale', 'd3-shape'],
        },
      },
    },
  },
  // DuckDB-WASM trae workers precompilados; excluirlo evita que Vite intente
  // optimizarlos y rompa las rutas de los .wasm.
  optimizeDeps: { exclude: ['@duckdb/duckdb-wasm'] },
  server: { port: 5173, host: true },
});
