// Estandar de codificacion: Google TypeScript Style Guide (gts), con las
// reglas oficiales de React para hooks y para la recarga de Vite.
import gts from 'gts';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import {defineConfig, globalIgnores} from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist']),
  ...gts,
  {
    // Este archivo, los de configuracion y las pruebas son modulos ES de Node
    files: ['eslint.config.js', '*.config.js', 'pruebas/**/*.mjs'],
    languageOptions: {sourceType: 'module', globals: globals.node},
  },
  {
    // Las pruebas ejecutan funciones dentro del navegador
    files: ['pruebas/**/*.mjs'],
    languageOptions: {globals: {...globals.node, ...globals.browser}},
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        project: ['./tsconfig.app.json', './tsconfig.node.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
]);
