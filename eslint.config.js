/**
 * ESLint — configuración plana (ESLint 9+).
 *
 * El proyecto vivió cuatro fases sin linter: el script existía en `package.json`
 * y llamaba a un binario que no era dependencia, sin archivo de configuración y
 * con un flag (`--ext`) que ESLint 9 eliminó. Corría de casualidad en esta
 * máquina, por un ESLint global, y fallaba en cualquier otra.
 *
 * Decisiones de esta configuración:
 *
 * 1. **Con información de tipos.** `recommendedTypeChecked` es más lento que la
 *    variante liviana, pero es la que encuentra bugs de verdad: promesas sin
 *    esperar, `any` que se cuela, comparaciones que siempre dan lo mismo. En un
 *    servidor de juego lleno de `async` eso no es un lujo.
 *
 * 2. **Un bloque por paquete.** No es lo mismo `client/` —que corre en un
 *    navegador y usa React— que `server-vps/`, que corre en Node. Cada uno
 *    declara los globales que realmente tiene, así una variable inexistente se
 *    detecta en vez de pasar por global del otro entorno.
 *
 * 3. **Los desactivados van con motivo escrito.** Una regla apagada sin
 *    explicación es deuda disfrazada de configuración.
 */

import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  /* --- Lo que no se lintea ------------------------------------------------ */
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      'dist-deploy/**',
      'client/public/**',
      'eslint.config.js',
      // Config de PM2: CommonJS plano, fuera de todo tsconfig a propósito.
      'server-vps/ecosystem.config.cjs',
    ],
  },

  /* --- Base para todo el TypeScript --------------------------------------- */
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // `projectService` resuelve solo cuál de los cuatro tsconfig aplica a
        // cada archivo. Sin esto habría que enumerarlos y mantener la lista.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // El proyecto usa `_` para lo que se descarta a propósito: el segundo
      // elemento de un `map((x, _i) =>`, un parámetro que exige una interfaz.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // Una promesa sin esperar en un servidor de juego es un error que aparece
      // como estado corrupto media hora después. Se marca; para el caso
      // deliberado está `void`, que la regla acepta.
      '@typescript-eslint/no-floating-promises': 'error',

      // Apagada con motivo: marca todo método `async` que no espera nada
      // adentro, y en este proyecto eso son las implementaciones de contratos
      // ajenos —los ganchos de ciclo de vida de Colyseus (`onAuth`), los mocks
      // de una interfaz async— donde el `async` no es opcional: lo pide la firma
      // que se está implementando. No detecta bugs, sólo esa forma. Los que sí
      // detectan errores de asincronía —`no-floating-promises` y
      // `no-misused-promises`— quedan encendidos.
      '@typescript-eslint/require-await': 'off',
    },
  },

  /* --- /shared: isomorfo, sin DOM ni Node --------------------------------- */
  {
    files: ['shared/**/*.ts'],
    languageOptions: {
      globals: {},
    },
    rules: {
      // `/shared` lo importan los tres paquetes: no puede depender de `console`
      // ni de nada que exista en un entorno y no en el otro.
      'no-console': 'error',
      'no-restricted-globals': [
        'error',
        { name: 'window', message: '/shared corre también en el servidor.' },
        { name: 'document', message: '/shared corre también en el servidor.' },
        { name: 'process', message: '/shared corre también en el navegador.' },
      ],
    },
  },

  /* --- /client: navegador + React ----------------------------------------- */
  {
    files: ['client/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  /* --- /server-vps y /tools: Node ----------------------------------------- */
  {
    files: ['server-vps/**/*.ts', 'tools/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  /* --- Scripts .mjs: JavaScript plano, sin información de tipos ----------- */
  //
  // Van en dos bloques y no en uno: el objeto literal de un solo bloque haría
  // que mi `languageOptions` pisara entero el que trae `disableTypeChecked`, y
  // el parser seguiría buscando estos archivos en un tsconfig donde no están.
  {
    files: ['**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ['**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // Estos scripts imprimen su resultado: ése es su propósito.
      'no-console': 'off',
    },
  },

  /* --- Scripts de CI y herramientas: imprimen por diseño ------------------ */
  {
    files: ['tools/**/*.ts', 'server-vps/scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
);
