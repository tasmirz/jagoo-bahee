/**
 * Pure domain layer: the validation pipeline, canonical rules, path selection.
 * Deterministic given its inputs — no I/O, no clock, no random (AR-01, AR-02).
 */

export {
  Plane,
  KeyAlg,
  Priority,
  ENVELOPE_VERSION,
  type AntiAbuse,
  type ParsedEnvelope,
  type StoredEnvelope,
} from './envelope.js';
export { RejectionCode, EnvelopeRejected, isRejection, type RejectionDetail } from './errors.js';
export {
  valid,
  invalid,
  allowed,
  denied,
  type DomainHandler,
  type ValidationResult,
  type AuthDecision,
  type Tx,
} from './domain-handler.js';
export { DomainRegistry } from './domain-registry.js';
export { acceptVersion, acceptDomain, acceptPlane, acceptEnvelopeHeader } from './accept.js';
