/* eslint-env node */
module.exports = {
  root: true,
  extends: ['expo', 'plugin:@typescript-eslint/recommended'],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'react', 'react-native'],
  ignorePatterns: [
    'node_modules/**',
    '.expo/**',
    'dist/**',
    'web-build/**',
    'android/**',
    'ios/**',
    'coverage/**',
    'babel.config.js',
    'jest.setup.ts',
    '__mocks__/**',
  ],
  env: {
    browser: true,
    node: true,
    jest: true,
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  rules: {
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-require-imports': 'off', // tests use require() for lazy + cycle-free imports
    '@typescript-eslint/array-type': 'off',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'no-undef': 'off', // TS handles this better
  },
};