// Metro configuration for the monorepo.
//
// ── Why this file has to exist ────────────────────────────────────────────────────────
// Two defaults break `@jagoo/sdk` here, and both fail as a bare "Unable to resolve module"
// that says nothing about the real cause:
//
//   1. Metro in Expo SDK 52 does NOT read package `exports` maps by default, so every
//      subpath import (`@jagoo/sdk/core`) is unresolvable no matter how the package is
//      declared.
//   2. Once exports ARE read, condition ORDER decides what gets bundled. `react-native`
//      must come before `require`, or Metro pulls the CommonJS build meant for NestJS.
//
// Note that the `react-native` condition resolves to the sdk's BUILT ESM output, not its
// TypeScript source. Bundling source would be nicer for the edit loop, but Metro does not
// remap the TypeScript-ESM `./canonical.js` specifiers to `./canonical.ts` the way tsc and
// Vite do, and it fails with a bare "Unable to resolve module ./canonical.js". So the sdk
// must be built before the app bundles — `turbo` handles that via `dev`/`build` depending
// on `^build`.
//
// `backend/src/sdk-interop.spec.ts` covers the Node side of the same wiring.

const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// pnpm with node-linker=hoisted puts the real modules at the workspace root (build log
// L-04). Metro must watch there or workspace packages resolve to stale copies.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

config.resolver.unstable_enablePackageExports = true;
config.resolver.unstable_conditionNames = ['react-native', 'require', 'import', 'default'];

module.exports = config;
