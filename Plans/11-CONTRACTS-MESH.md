# 11 — Offline outbox, mesh, and `.jbpack` contracts

> **Frozen before P5 implementation.** This document closes the wire-format gap identified in
> `Plans/09-TASKS.md`. Existing signed envelopes remain the only mutable application object.

## 1. Durable outbox

An outbox record stores the exact encoded signed envelope, never an unsigned draft:

```typescript
interface OutboxRecord {
  contentId: string;
  plane: Plane;
  priority: Priority;
  envelope: Uint8Array;
  queuedAtMs: number;
  attempts: number;
  nextAttemptAtMs: number;
  state: "pending" | "sending" | "receipted";
  receipt?: Receipt;
}
```

- `contentId` is final before insertion and is the primary key.
- Queue ordering is `(priority rank, queuedAtMs, contentId)`, with `BROADCAST`, `DIRECT`,
  `CHECKIN`, then `BULK`.
- A crash while `sending` returns the record to `pending` on the next open.
- Acceptance and duplicate acceptance both attach the server's original receipt.
- Retry backoff is exponential with jitter and capped at five minutes.

## 2. Mesh frames

Every data-channel message is a canonical JSON object encoded as UTF-8. Binary fields use
unpadded base64url. Unknown fields are ignored; unknown `version` or `kind` is rejected.

```typescript
type MeshFrame =
  | { version: 1; kind: "hello"; peerId: string; nonce: string; maxFrameBytes: number }
  | { version: 1; kind: "summary"; bloom: string; count: number; generatedAtMs: number }
  | { version: 1; kind: "want"; contentIds: string[] }
  | { version: 1; kind: "envelope"; contentId: string; envelope: string;
      originAtMs: number; expiresAtMs: number; hops: number }
  | { version: 1; kind: "ack"; contentId: string; status: "stored" | "duplicate" | "rejected";
      error?: string };
```

Limits:

- frame: 65,536 bytes; `want`: 128 IDs; peer ID: 80 UTF-8 bytes;
- hop limit: 8; maximum TTL: 72 hours;
- one peer may contribute 1,000 envelopes or 8 MiB per hour;
- `BULK` does not cross local mesh in P5; classes 0–2 do.

The receiver checks frame limits, TTL and quota, then runs the envelope through the same full
verification pipeline used by HTTP and federation **before** storage. It increments `hops` only
after acceptance and never relays a rejected frame.

## 3. QR pairing

Pairing payloads are base64url-encoded canonical JSON:

```typescript
interface MeshPairing {
  version: 1;
  peerId: string;
  role: "offer" | "answer";
  sessionDescription: string;
  nonce: string;       // 16 random bytes
  expiresAtMs: number; // at most ten minutes
}
```

The UI displays the nonce fingerprint on both devices. Pairing uses WebRTC data channels and
requires no signalling server: offer and answer are exchanged by QR or copy/paste.

## 4. `.jbpack`

The file is UTF-8 canonical JSON:

```typescript
interface JbPack {
  format: "jagoo-bundle";
  version: 1;
  createdAtMs: number;
  exporterKey?: string;
  manifestSignature?: string;
  envelopes: Array<{ contentId: string; envelope: string }>;
}
```

The manifest signature, when present, authenticates ordering and provenance only. Import never
trusts it for envelope validity: each envelope is independently parsed, content-address checked,
signature-verified, policy-checked and deduplicated before insertion. Import caps files at 16 MiB
and 10,000 envelopes.

## 5. Native lifecycle

Expo has no service worker. The equivalent contract is a durable on-device queue drained on
application foreground and network reconnection, with a best-effort background task where the OS
permits it. Correctness never depends on background execution.

## 6. Privacy and plane separation

- Outbox records contain no combined identity index.
- Mesh frames carry one signed envelope and therefore one plane.
- Peer state records transport metadata only; it never records a Forum key beside a Signal key.
- Local cached reads and pending states use the same plane-specific stores and panic boundaries.
