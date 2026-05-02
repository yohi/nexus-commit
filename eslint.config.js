import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import pluginSecurity from 'eslint-plugin-security';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'tests/**/*.js'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  pluginSecurity.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
        fetch: 'readonly',
        DOMException: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
      },
      parserOptions: {
        ecmaVersion: 2023,
        sourceType: 'module',
      },
    },
  },
  {
    files: ['tests/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.vitest,
      },
    },
  },
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/prompt.ts'],
    rules: {
      'no-control-regex': 'off',
    },
  },
  {
    files: ['src/llm.ts', 'src/nexus-client.ts', 'src/flags.ts'],
    rules: {
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-object-injection': 'off',
    },
  },
);
