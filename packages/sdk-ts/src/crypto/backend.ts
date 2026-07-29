/**
 * Public CryptoBackend entry point.
 *
 * Loading the seam also registers the portable default. `js-backend.ts` imports only
 * `backend-state.ts`, so this bootstrap has no circular dependency. Android replaces the
 * active backend during app bootstrap; Node, tests and iOS need no installation step.
 */
import './js-backend.js';

export * from './backend-state.js';
