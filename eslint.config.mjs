import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'drizzle/**',
      'playwright-report/**',
      'test-results/**',
      'backups/**',
      'next-env.d.ts',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Datos de vecinos: nunca en almacenamiento del navegador que no sea IndexedDB.
      'no-restricted-globals': [
        'error',
        {
          name: 'localStorage',
          message: 'Prohibido: usar IndexedDB (Dexie) para datos de vecinos.',
        },
        {
          name: 'sessionStorage',
          message: 'Prohibido: usar IndexedDB (Dexie) para datos de vecinos.',
        },
      ],
    },
  },
];

export default eslintConfig;
