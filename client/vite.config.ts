import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Build del cliente 3D. Sale un bundle estático que se sube a Hostinger junto con
 * la landing PHP; el juego en vivo habla con el VPS por WebSocket.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@esquel/shared': fileURLToPath(new URL('../shared/index.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    // Three pesa: separarlo mantiene el bundle de UI chico y cacheable aparte.
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          r3f: ['@react-three/fiber', '@react-three/drei'],
          react: ['react', 'react-dom'],
        },
      },
    },
    chunkSizeWarningLimit: 1200,
  },
  server: {
    port: 5173,
    host: true,
  },
});
