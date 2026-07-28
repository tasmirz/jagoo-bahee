/**
 * In-memory doubles for every port (AR-03).
 *
 * Unit tests wire these; integration tests wire the real adapters via testcontainers.
 * `NullLabelProvider` doubles as the production binding when the labeller is off (AR-12).
 */

export {
  InMemoryEnvelopeStore,
  InMemoryProjectionStore,
  FixedClock,
  SequentialRandom,
} from './in-memory-stores.js';
export {
  StubSignatureVerifier,
  InMemoryCertificateStore,
  InMemoryCreditLedger,
  InMemoryNullifierRegistry,
  InMemoryCredentialIssuer,
  InMemoryWitnessLog,
  InMemoryPeerDirectory,
  NarrowestScopePathSelector,
  InMemoryFederationOut,
  NullLabelProvider,
  InMemoryBlobStore,
  RecordingNotificationSink,
} from './in-memory-services.js';
