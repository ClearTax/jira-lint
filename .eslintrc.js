module.exports = {
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'eslint-config-prettier'],
  plugins: ['@typescript-eslint', 'eslint-plugin-prettier', 'jest', 'no-only-tests'],
  env: {
    node: true,
  },
  rules: {
    'no-useless-catch': 'warn',
    '@typescript-eslint/no-namespace': 'warn',
    'no-console': [
      'warn',
      {
        allow: ['debug', 'error', 'warn'],
      },
    ],
    complexity: [
      'warn',
      {
        max: 3,
      },
    ],
    'default-case': 'error',
    '@typescript-eslint/no-unused-vars': 'error',
    eqeqeq: ['error', 'always'],
    'no-magic-numbers': [
      'warn',
      {
        ignore: [-1, 0, 1, 2, 3, 4, 100],
        ignoreArrayIndexes: true,
      },
    ],
    'vars-on-top': 'error',
    'max-params': ['error', 3],
    'max-nested-callbacks': ['error', 3],
    'max-lines-per-function': [
      'warn',
      {
        max: 35,
        skipBlankLines: true,
        skipComments: true,
      },
    ],
    'no-unneeded-ternary': 'error',
    'no-nested-ternary': 'error',
    'max-lines': [
      'error',
      {
        max: 500,
        skipBlankLines: true,
      },
    ],
    'max-depth': ['warn', 4],
    'no-only-tests/no-only-tests': 'error',
  },
  overrides: [
    {
      files: ['**/*.test.js', '**/*.test.jsx', '**/*.test.ts', '**/*.test.tsx', '.eslintrc.js'],
      rules: {
        'max-lines-per-function': [
          'error',
          {
            max: 500,
            skipBlankLines: true,
            skipComments: true,
          },
        ],
        'no-magic-numbers': 'off',
        'max-nested-callbacks': ['error', 6],
      },
    },
  ],
};