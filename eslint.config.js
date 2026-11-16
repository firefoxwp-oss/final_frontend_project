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
    // Este archivo y los de configuracion son modulos ES, no CommonJS
    files: ['eslint.config.js', '*.config.js'],
    languageOptions: {sourceType: 'module', globals: globals.node},
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
