/**
 * @jagoo/sdk — the shared contract surface.
 *
 * Imported by BOTH `backend/` and `frontend/`. That is the point: the bytes signed on a
 * phone are the bytes verified by a node, produced by the same code path (VIS-04).
 */

export * from './core/index.js';
export * from './signer/index.js';
export * as crypto from './crypto/index.js';
export {
  DOMAIN_SPECS,
  lookupDomain,
  domainsForPlane,
  type DomainSpec,
  type RegistryPlane,
  type RegistryPriority,
  type RegistryScopeKind,
  type RegistryGate,
  type RegistryKeyAlg,
} from './gen/registry.js';
