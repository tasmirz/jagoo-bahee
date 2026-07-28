# R6 — Messaging (both planes)

One engine, two planes. The same cryptographic implementation serves pseudonymous Forum DMs and identified Signal messaging, parameterised by identity provider — Dependency Inversion applied ([`../07-ARCHITECTURE.md`](../07-ARCHITECTURE.md) §4).

## 1. Feature requirements

| ID | Requirement | Plane | v1 | Phase |
|---|---|---|---|---|
| MSG-01 | Send message with optional subject and body | both | ✓ | P1 / P4 |
| MSG-02 | Threaded replies | both | ✓ | P1 / P4 |
| MSG-03 | Conversation list and thread view | both | ✓ | P1 / P4 |
| MSG-04 | Mark read / unread | both | ✓ | P1 / P4 |
| MSG-05 | Delete message (local tombstone) | both | ✓ | P1 / P4 |
| MSG-06 | Block enforcement | FORUM | ✓ | P1 |
| MSG-07 | Attachments, separately encrypted | both | ✓ | P1 / P4 |
| MSG-08 | Sender signature | both | ✓ | P1 |
| MSG-09 | **End-to-end encryption — server stores ciphertext only** | both | ✗ (plaintext) | P1 / P4 |
| MSG-10 | Hybrid X25519 + ML-KEM-768 key agreement | both | — | P1 / P4 |
| MSG-11 | Forward secrecy via symmetric ratchet | both | — | P1 / P4 |
| MSG-12 | Prekey bundles for offline session initiation | both | — | P4 |
| MSG-13 | Delivery receipts: queued / relayed / delivered / read | both | — | P4 |
| MSG-14 | Ratchet counter gap detection surfaced to the user | both | — | P4 |
| MSG-15 | Small-group messaging via sender keys (≤ 64 members) | SIGNAL | — | P4 |
| MSG-16 | Offline compose and queued send | both | — | P5 |
| MSG-17 | Delivery over mesh | both | — | P5 |
| MSG-18 | Delivery over Reticulum | SIGNAL | — | P6 |
| MSG-19 | Separate session and prekey stores per plane | both | — | P4 |

### MSG-09 rationale

v1 stored message markdown in plaintext server-side, signed but unencrypted. Server compromise or physical seizure exposed every private conversation ever sent. This is the single highest-severity data risk in the v1 system given the threat model.

## 2. Cryptographic requirements

| ID | Requirement |
|---|---|
| MSG-20 | Session key derives from **both** X25519 and ML-KEM-768; breaking it requires breaking both |
| MSG-21 | Compromising the device today MUST NOT decrypt yesterday's messages |
| MSG-22 | Plaintext MUST NOT exist server-side in any plane, verified by direct database inspection in an automated test |
| MSG-23 | Prekey bundles MUST be publishable so a sender can start a session against an offline recipient — without this, store-and-forward messaging cannot work |
| MSG-24 | Attachment keys are per-attachment; the blob store sees an opaque object with no conversation association |
| MSG-25 | Group rekey on membership change (add or remove) |

### Why post-quantum here and not on signatures

Message confidentiality is the one place a quantum computer is a real threat to this system. Traffic captured today can be decrypted a decade from now, and the people it exposes will still be exposed. By contrast, a signature forged in 2035 over a 2026 message has no value to anyone.

So the PQ budget goes to **ML-KEM-768 in the key agreement** — a per-session cost, invisible per message — while signatures stay Ed25519 at 64 bytes, which is what makes the LoRa and mesh paths viable at all.

## 3. Metadata minimisation

| ID | Requirement |
|---|---|
| MSG-26 | The node MUST NOT log routing metadata (sender, recipient, timing) beyond what delivery requires |
| MSG-27 | Delivery state MUST be purged once `DELIVERED` |
| MSG-28 | Forum-plane messaging MUST NOT persist any mapping from network address to key |
| MSG-29 | Signal-plane and Forum-plane messages MUST NOT share a transport batch, stream frame, or SSE connection |

## 4. Engine contract

```typescript
class MessagingEngine<P extends Plane> {
  constructor(
    private readonly signer:   PlaneSigner<P>,
    private readonly prekeys:  PrekeyStore<P>,
    private readonly sessions: SessionStore<P>,
    private readonly clock:    Clock,
  ) {}

  publishPrekeys(count: number): Promise<Envelope>;
  startSession(peer: PublicIdentity, first: Uint8Array): Promise<Envelope>;
  send(session: string, plaintext: Uint8Array): Promise<Envelope>;
  receive(env: ParsedEnvelope): Promise<DecryptedMessage>;
  acknowledge(messageId: string, state: DeliveryState): Promise<Envelope>;
}
```

| ID | Requirement |
|---|---|
| MSG-30 | The two instances MUST have **separate** prekey and session stores. Sharing a store across planes violates plane separation regardless of the engine being shared. |
| MSG-31 | The type parameter prevents passing a Forum signer where a Signal signer is expected — cross-plane misuse is a compile error, not a runtime check |
| MSG-32 | The engine MUST have zero plane-specific branches. If one appears, the abstraction is wrong. |

## 5. Wire bodies

| Plane | Domain | Body | Priority |
|---|---|---|---|
| FORUM | `jb:message:forum:v1` | `ForumMessageSend` | DIRECT |
| SIGNAL | `jb:message:session:v1` | `SignalSessionInit` | DIRECT |
| SIGNAL | `jb:message:signal:v1` | `SignalMessage` | DIRECT |
| SIGNAL | `jb:message:receipt:v1` | `SignalDeliveryReceipt` | DIRECT |
| SIGNAL | `jb:message:prekeys:v1` | `PrekeyBundle` | BULK |
| SIGNAL | `jb:group:create:v1` | `SignalGroupCreate` | DIRECT |
| SIGNAL | `jb:group:update:v1` | `SignalGroupUpdate` | DIRECT |

**MSG-33:** `DIRECT` priority envelopes are budgeted at ≤ 1 KB so they traverse constrained transports. Attachments are referenced by content ID, never inlined.
