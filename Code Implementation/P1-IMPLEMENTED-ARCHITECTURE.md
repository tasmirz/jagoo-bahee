# P1 Implemented Architecture

This document describes the code that exists after the P1 audit. Frozen requirements remain
authoritative; this is the implementation map.

## Write and Evidence Path

`POST /v1/envelopes` accepts one base64 envelope or a homogeneous-plane batch. Every item runs
the registry-driven 19-step `IngressPipeline`; there is no feature write route. Mongo reserves
sparse log indices, then the envelope, nonce, feature projection, dense RFC 6962 leaf, and signed
receipt commit in one transaction. Duplicate content returns its original persisted receipt.

Receipts distinguish `logIndex` from `leafIndex` (ADR-005). Read responses include canonical bytes,
the author signature, server key and signature, STH, and inclusion path. The SDK and Expo client
verify that evidence offline.

## Identity and Anti-Abuse

Forum keys publish ML-DSA-44-attested Ed25519 certificates. Revocation is non-retroactive.
Rotation copies profile standing, memberships, and role assignments to the successor. A duress
revocation carries an inner signature by the endangered key, allowing an untrusted courier to
publish it without gaining arbitrary revocation power (ADR-006).

Auth uses one-use key-bound challenges and separate HMAC keys and typed claims for access and
refresh tokens. Refresh tokens rotate on use and are also delivered through HttpOnly, SameSite
cookies. Production refuses to start without durable Mongo/Redis/S3 and configured node, PoW,
auth, and credential secrets.

Redis runs atomic Lua credit and nullifier operations. PoW is stateless, key-bound Argon2id.
Membership credentials use RSA blind signatures. Rate-limit subjects ignore User-Agent and trust
forwarded addresses only through configured proxy hops.

## Read Models and Optional Services

All Forum handlers project from the envelope log. Post polls, crossposts, flags, score/karma,
reply/award/community counters, moderation state, default roles, and membership policy are retained.
`rebuild-projections` drops only derived `forum_*` collections and replays handlers without
re-spending anti-abuse state. Notifications
are derived for replies, key-ID mentions, awards, moderation, and follows; private read/delete
overrides stay in client storage.

The frozen Forum read table is implemented with opaque cursor pagination and provenance. SSE emits
accepted Forum events. Redis cache invalidation uses tag sets and Lua—never keyspace `SCAN`.
Label preflight fails open. Attachment claims are accepted only when confirmed object metadata
matches the hash, MIME, and size inside the signed claim.

## Client Foundations

The Expo signer keeps a scrypt/XChaCha-wrapped mnemonic in SecureStore, derives device,
per-community, and epoch keys, creates certificates, signs envelopes, exports owner-authorized
duress bodies, and wipes Forum material independently. Native Argon2 solves server challenges.
Hybrid Forum DMs combine X25519 and ML-KEM-768 through HKDF before ChaCha20-Poly1305 encryption.

The data layer is offline-first through identity- and origin-scoped AsyncStorage plus TanStack
Query, reports cache age, and tracks network reachability. Forum panic wipe clears the key vault
and only Forum cache. Bangla and English strings are first-class. Provenance verification requires
no network.

## Remaining P1 Work

The implemented core is not the complete P1 product. The authoritative gap matrix is
`P1-REQUIREMENTS-AUDIT.md`. In addition to the visual RN feature and audit screens, remaining work
includes administration/configuration APIs, the full attachment management lifecycle, operational
observability and documentation gates, moderation appeals, and binding the trusted network-subject
parser to a real limiter/IP-block path.

The visual work is blocked on the requested product design brief. Consequently P1-G1 and ADR-003's
screen-based replacement for P1-G2/P1-G10 remain open. Mongo/Redis integration gates are committed
but were not executed locally because Docker Desktop was unavailable; they run when `MONGO_URL`
and `REDIS_URL` are supplied.
