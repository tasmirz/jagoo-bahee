# ADR-004 — Key-certificate bootstrap and envelope budget

**Status:** Accepted · 2026-07-29  
**Decision:** P1 contract correction approved by the project owner.

## Context

`KeyCertificate` contains a 1,312-byte ML-DSA-44 public key and a 2,420-byte
attestation. Its encoded body cannot fit the former 512-byte `BROADCAST` registry
budget. In addition, applying pipeline step 10 to a person's first certificate makes
certificate publication circular: the key would need to be certified before it can
publish the certificate that certifies it.

## Decision

The two plane-specific `jb:key:certify:*:v1` rows are `BULK` with an 8 KiB limit.
Certificates are cacheable identity material and may use ordinary store-and-forward;
the compact `jb:key:revoke:*:v1` rows remain `BROADCAST` so compromise information is
available on constrained links.

The generated registry adds `requires_certificate`, defaulting to `true`. Only
`jagoo.v1.KeyCertificate` rows may set it to `false`. Their handlers must validate the
self-signature, plane, validity interval, and PQ attestation before storing the
certificate. This is policy-driven—there is no domain branch in ingress.

## Consequences

The explicit exception solves bootstrap without weakening ordinary envelope validation.
Nodes that do not understand this registry field must reject the updated registry rather
than silently accepting a different policy; code generation and `proto:check` enforce
that agreement.
