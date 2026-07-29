# ADR-014: Signal push subscriptions are node-local envelopes

**Status:** Accepted  
**Date:** 2026-07-29

## Context

`ChannelSubscribe` is frozen in `signal.proto`, but the registry had no domain that could carry it
through the validation pipeline. Push subscriptions contain a device delivery token. They must be
signed and auditable, yet copying them to federated peers would disclose unnecessary device
metadata and make unsubscription ambiguous.

## Decision

Add `jb:channel:subscribe:v1` to the Signal plane and add the generated registry policy
`federate`, which defaults to `true`. The subscription row alone sets `federate: false`.

Ingress reads this generated policy at step 19. It does not branch on a domain name. The accepted
envelope remains in the local append-only log and projection, while federation fanout is skipped.
Publishing `push: false` removes the local token projection without erasing the signed audit event.

## Consequences

- Push opt-in and opt-out are authenticated, replay-protected actions.
- A device token is visible only to the selected home node and its configured push adapter.
- Federated nodes receive broadcasts, never subscriber tokens.
- New non-federated domains require an explicit registry decision visible in contract review.
