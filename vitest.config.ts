import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: [
      'tests/unit/**/*.test.ts',
      'tests/reglas/**/*.test.ts',
      'tests/integracion/**/*.test.ts',
    ],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    reporters: ['default'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
