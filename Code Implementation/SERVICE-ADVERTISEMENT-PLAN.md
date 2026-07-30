# Service advertisement — mCaptcha, blob store, audit log

Post-P2 feature plan. Written before code per §7.2.

## Problem

A node knows where its auxiliary services live; a client does not. Today `/health` advertises
`auditLogs` and `mcaptcha` only, and rewrites their host **only** when it is exactly `127.0.0.1`
or `localhost` (`discovery.controller.ts`). Three consequences:

1. **The blob store is never advertised at all.** `POST /v1/attachments/upload-url` returns a
   presigned URL built from `S3_ENDPOINT` — `http://127.0.0.1:9000/...` — which no phone can reach.
2. **A private-LAN advertised host is passed through untouched.** A node reached over a tunnel
   hands the client `192.168.1.20:3100` and the client cannot say why it failed.
3. **Nothing is user-correctable.** When discovery is wrong the app is simply broken.

## The presigned-URL constraint — why the blob store is not like the other two

SigV4 signs the `host` header. A client that rewrites the host of a presigned URL gets
`SignatureDoesNotMatch`, so the blob store **cannot** be fixed by the same client-side rewrite that
works for mCaptcha and the audit log. The URL has to be signed for the host the client will use.

`S3_PUBLIC_ENDPOINT` therefore selects the endpoint used **for presigning only**. Server-to-MinIO
traffic keeps using `S3_ENDPOINT`, which stays an internal name (`http://minio:9000`) and never has
to be reachable from outside.

## `ops/service-map.json`

Keyed by **local port**, because that is exactly what a tunnel maps and it needs no notion of
service kind:

```json
{
  "publicHost": "bore.pub",
  "scheme": "http",
  "ports": { "3000": 3000, "3100": 3100, "7000": 7000, "9000": 9000 }
}
```

Absent, unreadable, or malformed → advertisement behaves as it does today. This must never be a
boot dependency: a node whose mapping file is corrupt still serves, it just advertises local
addresses. Path overridable with `SERVICE_MAP_FILE`.

The `*_SERVICES` env vars keep declaring **local** addresses. The map translates them at the
moment of advertisement, so rotating a tunnel port touches one file and needs no service restart
beyond re-reading it.

## Client resolution rule

One pure function, `resolveServiceAddress(nodeBaseUrl, service, override?)`:

| Advertised host                            | Result                                          |
| ------------------------------------------ | ----------------------------------------------- |
| Manual override present                    | the override, verbatim — always wins            |
| loopback / private LAN / `.local` / unspecified | node's host + **advertised port**          |
| anything else (public IP, `bore.pub`, DNS) | advertised address verbatim                     |

This satisfies all three requested cases with one rule and no mode flag:

- **local server** → only the port differs from the node's address;
- **bore.pub** → either the map already advertised `bore.pub:port` (verbatim branch), or the map is
  absent and the host-swap branch produces `bore.pub:<advertised port>`;
- **other** → the full advertised address is used.

The blob store resolves the same way for **display and reachability checks**, but a presigned URL
returned by the node is used exactly as given — never rewritten. If the operator has not set
`S3_PUBLIC_ENDPOINT`, uploads fail with a message that says so instead of a signature error.

## Manual overrides

Persisted under `jb.service-overrides.v1`, `{ kind -> address }`. Editable in
**Network & services** (`app/network.tsx`), which is settings. **Not** in `welcome-flow.tsx`:
someone joining under a shutdown should not be asked to hand-configure three service URLs before
they can post, and a wrong value there is indistinguishable from the node being down.

## Deliverables

| # | File | Change |
| - | ---- | ------ |
| 1 | `core/ports/service-directory.port.ts` | `BLOB` kind; `publicAddress` on `AuxiliaryService` |
| 2 | `core/domain/service-map.ts` | pure parse + apply of the port map |
| 3 | `adapters/outbound/configured-service-directory.ts` | read `ops/service-map.json`, `BLOB_SERVICES` |
| 4 | `adapters/inbound/http/discovery.controller.ts` | advertise `blobs`; widen the local-host test |
| 5 | `adapters/outbound/s3/s3-blob-store.ts` | presign against the public endpoint |
| 6 | `composition/app.module.ts` | `S3_PUBLIC_ENDPOINT` wiring |
| 7 | `frontend/src/data/service-address.ts` | the resolution rule, pure |
| 8 | `frontend/src/data/service-overrides.ts` | persistence |
| 9 | `frontend/src/features/connectivity/screens.tsx` | override UI, i18n, a11y |
| 10 | `ops/service-map.json`, `justfile` | example map + `publish-all` |

## Exit gate

- A node behind `bore.pub` advertises three reachable services and an upload succeeds end to end.
- `service-map.json` absent → byte-identical discovery output to today.
- A corrupt `service-map.json` does not stop the node from serving.
- Resolution rule unit-tested across loopback, private LAN, `bore.pub`, public DNS, and override.
- Every new string present in both English and Bangla.
