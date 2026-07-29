# ADR-013 — Signal session-init budget is 2 KiB

**Status:** Accepted · 2026-07-29  
**Governs:** MS-01, MS-04, T4.16, T4.17

## Finding

The frozen registry assigned `jb:message:session:v1` a 1,024-byte envelope budget while the frozen
body requires an ML-KEM-768 ciphertext. That ciphertext alone is 1,088 bytes, before the 32-byte
ephemeral X25519 key, recipient key, first-message ciphertext, envelope fields and Ed25519 signature.
A conforming session-init therefore cannot pass pipeline step 1.

## Decision

Raise only the `jb:message:session:v1` registry `max_bytes` policy to 2,048 bytes. The protobuf wire
shape and domain version remain unchanged; this corrects an impossible admission policy rather than
changing signed semantics. Ordinary `SignalMessage` remains capped at 1,024 bytes and broadcasts at
512 bytes.

## Evidence required

P4-G6 must build a real hybrid X25519 + ML-KEM-768 first message and send its complete envelope
through ingress. A test with a toy KEM ciphertext is insufficient.
