// ESLint：CI 會執行 npx eslint .，有錯誤就不上線
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', 'shots/'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
    rules: {
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      // 中文排版刻意在字串裡用全形空白（U+3000）
      'no-irregular-whitespace': ['error', { skipStrings: true, skipTemplates: true }],
    },
  },
  { files: ['js/**/*.js'], languageOptions: { globals: globals.browser } },
  { files: ['sw.js'], languageOptions: { sourceType: 'script', globals: globals.serviceworker } },
  { files: ['scripts/**', 'tests/**', 'eslint.config.js'], languageOptions: { globals: globals.node } },
];
