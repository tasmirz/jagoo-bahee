/**
 * Port catalogue (Plans/07-ARCHITECTURE.md §2).
 *
 * AR-03: every port has at least one production adapter AND one in-memory double. Unit
 * tests run against doubles; integration tests run against real adapters. Mesh and
 * Reticulum paths are testable with no hardware.
 */

export {
  EnvelopeReader,
  EnvelopeWriter,
  ProjectionStore,
  type Collection,
} from './storage.port.js';
export {
  SignatureVerifier,
  CertificateStore,
  type KeyCertificate,
  type KeyRevocation,
} from './identity.port.js';
export {
  CreditLedger,
  NullifierRegistry,
  CredentialIssuer,
  PowVerifier,
  type CreditSubject,
  type CreditStatus,
  type PowChallenge,
  type PowSolution,
} from './anti-abuse.port.js';
export {
  WitnessLog,
  PeerLogStatus,
  type SignedTreeHead,
  type InclusionProof,
} from './transparency.port.js';
export {
  Transport,
  PeerDirectory,
  PathSelector,
  FederationOut,
  ReachabilityScope,
  PeerTrust,
  SCOPE_PREFERENCE,
  type PeerEndpoint,
  type PeerRecord,
  type SelectedPath,
  type BackfillReport,
} from './network.port.js';
export {
  LabelProvider,
  BlobStore,
  NotificationSink,
  type DraftContent,
  type LabelAdvice,
  type Label,
  type ResolvedContent,
  type UploadTicket,
  type BlobMetadata,
  type Notification,
} from './content.port.js';
export { Clock, RandomSource } from './system.port.js';
export {
  SessionAuth,
  type AuthChallenge,
  type SessionTokens,
  type AccessPrincipal,
} from './auth.port.js';
export { EventBus, type AcceptedEvent } from './events.port.js';
export { TaggedCache } from './cache.port.js';
export {
  RequestSecurity,
  type RequestSubject,
  type RequestDecision,
  type IpBlock,
} from './request-security.port.js';
export { Observability, type MetricsSnapshot } from './observability.port.js';
export { OperatorConfig, type SecurityConfig } from './operator-config.port.js';
