# ADR-006: Duress Revocation Authorization

**Status:** Accepted  
**Date:** 2026-07-29

## Decision

Add the optional protobuf field `KeyRevocation.authorization_signature = 6`. A `DURESS`
revocation must carry an Ed25519 signature made by `revoked_key` over the domain-separated
revocation fields. The outer envelope may be signed and submitted by any certified courier.

## Rationale

KY-02 requires a revocation that can be prepared while safe and published later by another
person. Letting the courier's envelope signature authorize the revocation would also let
that courier revoke any key. The inner signature proves prior consent without requiring
the endangered owner to be online.

The new field is wire-compatible with the frozen v1 protobuf: older readers ignore field 6,
while updated nodes require it only for `DURESS`.

For `ROTATE`, the old key still signs the outer envelope. Projection replay copies identity,
membership, and role standing to the replacement key while retaining old rows as history.
