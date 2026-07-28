// Flat ESLint config for the whole workspace.
//
// The architectural rules below are NOT style preferences — each one is a gate from Plans/:
//   AR-01  the core depends on nothing but its own ports          (P0-G6)
//   AR-02  core/domain is pure: deterministic, no I/O, no clock, no random
//   AR-05  the ingress pipeline MUST NOT switch on domain
//   SG-01  no private key in a variable outside the signer boundary
//   NFR-M03 no branch on transport ID outside the transport layer
//
// Enforced in CI by lint, not by discipline. See CLAUDE.md §5.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importX from 'eslint-plugin-import-x';

/** Modules the pure domain layer must never reach for. */
const IMPURE_MODULES = [
  'mongodb',
  'mongoose',
  'ioredis',
  'redis',
  '@aws-sdk/*',
  'fastify',
  'express',
  '@nestjs/*',
  '@grpc/*',
  'node:fs',
  'node:net',
  'node:http',
  'node:https',
  'node:dns',
  'fs',
  'net',
  'http',
  'https',
  'dns',
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/node_modules/**',
      '**/.expo/**',
      '**/src/gen/**', // generated from proto/ — never hand-edited (AR-10, build log L-01)
      '**/coverage/**',
      'crates/**',
      'tools/vectors/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    plugins: { 'import-x': importX },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },

  // ── AR-01 / AR-02: core/domain is pure ────────────────────────────────────
  // Deterministic given its inputs. No clock reads, no random, no I/O — those are
  // injected ports. This is what makes the validation pipeline and the path selector
  // unit-testable with no infrastructure.
  {
    files: ['backend/src/core/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: IMPURE_MODULES,
              message:
                'AR-01/AR-02: core/domain is pure. Drivers, frameworks, and I/O belong in adapters/ behind a port.',
            },
            {
              group: ['**/adapters/**', '**/features/**', '**/composition/**', '../app/**'],
              message:
                'AR-01: the core depends on nothing but its own ports. Adapters depend on the core, never the reverse.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: 'AR-02: inject the Clock port. core/domain must be deterministic.' },
        { name: 'fetch', message: 'AR-02: core/domain performs no I/O.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'AR-02: inject the RandomSource port.' },
        { object: 'Date', property: 'now', message: 'AR-02: inject the Clock port.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'NewExpression[callee.name="Date"]',
          message: 'AR-02: inject the Clock port. core/domain must be deterministic given its inputs.',
        },
      ],
    },
  },

  // ── AR-01: the whole core is framework-free ───────────────────────────────
  {
    files: ['backend/src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@nestjs/*', 'mongodb', 'mongoose', 'ioredis', 'redis', '@aws-sdk/*', 'fastify'],
              message:
                'AR-01: the core declares ports; adapters implement them. Framework and driver types stay in adapters/. See ADR-002.',
            },
            {
              group: ['**/adapters/**', '**/composition/**'],
              message: 'AR-01: adapters depend on the core, never the reverse.',
            },
          ],
        },
      ],
      // AR-05 / NFR-M02: the pipeline looks the handler up in the registry.
      // A switch on domain means the Open/Closed abstraction has failed.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'SwitchStatement[discriminant.property.name="domain"]',
          message:
            'AR-05: no switch on domain in the core. Register a DomainHandler and let DomainRegistry dispatch.',
        },
        {
          selector: 'SwitchStatement[discriminant.name="domain"]',
          message:
            'AR-05: no switch on domain in the core. Register a DomainHandler and let DomainRegistry dispatch.',
        },
        {
          selector: 'SwitchStatement[discriminant.property.name="transportId"]',
          message:
            'NFR-M03: no branch on transport ID outside the transport layer. Every Transport is substitutable (Liskov).',
        },
      ],
    },
  },

  // ── SG-01: the signer boundary ────────────────────────────────────────────
  // No code outside the signer may hold a private key in a variable. In React Native
  // this lint rule replaces the Web Worker isolation the Plans assume — see ADR-003 §5.
  {
    files: ['packages/sdk-ts/src/**/*.ts', 'backend/src/**/*.ts', 'frontend/src/**/*.ts'],
    ignores: ['packages/sdk-ts/src/signer/**', 'frontend/src/signer/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/signer/internal/**', '**/signer/keys/**', '@jagoo/sdk/signer/internal'],
              message:
                'SG-01: raw key material is reachable only from packages/sdk-ts/src/signer/ and frontend/src/signer/.',
            },
          ],
        },
      ],
    },
  },

  // Tests may reach for whatever they need to construct a scenario.
  {
    files: ['**/*.spec.ts', '**/*.test.ts', '**/test/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
      'no-restricted-globals': 'off',
      'no-restricted-properties': 'off',
      'no-restricted-syntax': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
