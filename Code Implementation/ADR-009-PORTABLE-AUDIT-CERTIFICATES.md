# ADR-009 — Portable audit certificates and independent retention

**Status:** accepted  
**Date:** 2026-07-29

## Context

The node already signs a transparency receipt for every accepted envelope. A client needs to
retain that acknowledgement outside the operator's control and later ask the issuing node
whether the acknowledged content is still present or has been hidden with a reason.

Creating a second acknowledgement signature would add a second canonical format and risk the
two statements drifting. Sending only a receipt to an audit service would also omit the exact
request that produced it.

## Decision

An audit certificate is a JSON proof bundle containing:

- the exact UTF-8 HTTP request body, base64 encoded, plus method, path, and content type;
- the existing node-signed receipt and signed tree head;
- the content ID repeated as the portable action identifier.

`@jagoo/sdk` verifies the bundle by decoding the exact envelope bytes, enforcing canonical
encoding, recomputing the content ID, deriving the server ID from its key, verifying the receipt
and tree-head signatures, and verifying Merkle inclusion. No new signature format is introduced.

The node exposes:

- `POST /verify` for offline-compatible certificate verification;
- `POST /status` for current `online`, `hidden`, `deleted`, or `unknown_server` status;
- `GET /health` for node address and auxiliary-service discovery;
- `GET /federations` for configured peer-service reachability.

The Expo client stores a certificate before attempting network forwarding. It then sends the
whole bundle directly to every audit-log service advertised by `/health`. Failed deliveries
remain visible as pending rather than being reported as stored.

`services/audit-log` is a separately runnable service. It verifies certificates independently,
persists them as an append-only JSONL chain, hashes every record with its predecessor, rejects
conflicting certificates for the same `(server_id, content_id)`, and treats exact retries as
idempotent.

## Consequences

- An operator deleting an acknowledged envelope cannot erase the client's or third party's proof.
- A reasoned post/comment tombstone remains distinguishable from unexplained physical deletion.
- Audit services learn the submitted envelope packet. They do not receive client key material
  beyond what the public signed envelope already contains.
- Service addresses are deployment configuration, not cryptographic identity. `NODE_LOCAL_URLS`,
  `AUDIT_LOG_SERVICES`, `MCAPTCHA_SERVICES`, and `FEDERATION_SERVICES` may change without changing
  the node key.
