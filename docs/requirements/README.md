# Requirements Index

The requirements catalogue, split by module. Each file owns a stable ID prefix; IDs never change once assigned.

## Modules

| File | Module | ID prefixes |
|---|---|---|
| [R0-VISION-SCOPE.md](R0-VISION-SCOPE.md) | Vision, operating modes, design axioms | `VIS-*` |
| [R1-THREAT-MODEL.md](R1-THREAT-MODEL.md) | Adversaries, non-goals, safety property | `THR-*` |
| [R2-IDENTITY-AUTH.md](R2-IDENTITY-AUTH.md) | Keys, login, certificates, revocation, profiles | `AUTH-*`, `USR-*` |
| [R3-CONTENT.md](R3-CONTENT.md) | Posts, comments, votes, search | `PST-*`, `CMT-*`, `VOT-*`, `SRC-*` |
| [R4-COMMUNITIES.md](R4-COMMUNITIES.md) | Communities, membership, roles, permissions | `COM-*`, `ROL-*` |
| [R5-MODERATION.md](R5-MODERATION.md) | Mod actions, reports, labels, transparency log | `MOD-*`, `LBL-*`, `TRL-*` |
| [R6-MESSAGING.md](R6-MESSAGING.md) | E2EE messaging, both planes | `MSG-*` |
| [R7-SIGNAL-CRISIS.md](R7-SIGNAL-CRISIS.md) | Channels, broadcast, subscription, crisis reporting | `SIG-*`, `CRS-*` |
| [R8-MEDIA-ENGAGEMENT.md](R8-MEDIA-ENGAGEMENT.md) | Attachments, awards, notifications | `ATT-*`, `AWD-*`, `NOT-*` |
| [R9-FEDERATION-TRANSPORT.md](R9-FEDERATION-TRANSPORT.md) | Federation, ISP availability, bridging, transports | `FED-*`, `ISP-*`, `TRN-*` |
| [R10-ADMINISTRATION.md](R10-ADMINISTRATION.md) | Instance admin, operations, observability | `ADM-*` |
| [R11-PLATFORM.md](R11-PLATFORM.md) | Infrastructure, PWA, caching, build targets | `INF-*` |
| [R12-NON-FUNCTIONAL.md](R12-NON-FUNCTIONAL.md) | Performance, footprint, reliability, security, a11y | `NFR-*` |
| [R13-ACCEPTANCE.md](R13-ACCEPTANCE.md) | System-level acceptance criteria | `AC-*` |
| [R14-V1-MIGRATION.md](R14-V1-MIGRATION.md) | v1 → v2 endpoint and mechanism map | — |

## How to read a requirement row

```
| ID | Requirement | Plane | v1 | Phase |
```

- **ID** — stable, referenced by tests (`AR-15`: every MUST has a test citing its ID).
- **Plane** — `FORUM`, `SIGNAL`, or `—` for plane-independent.
- **v1** — `✓` carried forward unchanged · `✗` v1 had it but broken · `—` new in v2.
- **Phase** — where it lands (`08-PHASES.md`).

## Related documents

Contracts and architecture live one level up:

| | |
|---|---|
| [`../00-OVERVIEW.md`](../00-OVERVIEW.md) | Goal priority, two-plane model, resilience ladder |
| [`../01-IDENTITY-PLANES.md`](../01-IDENTITY-PLANES.md) | Plane separation invariants |
| [`../02-CONTRACTS-CORE.md`](../02-CONTRACTS-CORE.md) | Envelope, encoding, validation pipeline |
| [`../03-CONTRACTS-FORUM.md`](../03-CONTRACTS-FORUM.md) | Plane A bodies and read API |
| [`../04-CONTRACTS-SIGNAL.md`](../04-CONTRACTS-SIGNAL.md) | Plane B bodies and read API |
| [`../05-CONTRACTS-FEDERATION.md`](../05-CONTRACTS-FEDERATION.md) | Server↔server gRPC |
| [`../06-CONTRACTS-TRANSPORT.md`](../06-CONTRACTS-TRANSPORT.md) | Scopes, uplinks, ISP bridging, Reticulum |
| [`../07-ARCHITECTURE.md`](../07-ARCHITECTURE.md) | Ports, adapters, plugin registry, SOLID |
| [`../08-PHASES.md`](../08-PHASES.md) | Phase scope and exit gates |
| [`../09-TASKS.md`](../09-TASKS.md) | Task backlog |
| [`../10-IMPLEMENTATION-SEQUENCE.md`](../10-IMPLEMENTATION-SEQUENCE.md) | **How to actually build this** — order and parallel tracks |
