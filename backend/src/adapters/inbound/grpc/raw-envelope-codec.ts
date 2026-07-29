/**
 * The passthrough codec — ADR-008 §1.
 *
 * ── Why the gRPC layer must never re-encode an envelope ─────────────────────────────
 * `federation.proto` declares `Deliver`, `StreamActivities` and `Backfill` in terms of
 * `Envelope` messages, and `IngressPipeline.accept` takes `Uint8Array`. The obvious bridge
 * — decode the frame into a ts-proto object and call `Envelope.encode()` to get bytes back
 * — is wrong, and dangerously so.
 *
 * `packages/sdk-ts/src/core/decode.ts` does not restate the five canonical rules. It
 * decodes, RE-ENCODES, and compares bytes, so one check covers field order, omitted zeros,
 * minimal varints, unknown fields, NFC and trailing data. Re-encoding in the adapter would
 * perform exactly that normalisation *before* the pipeline ever saw the input. A peer could
 * then send any of the many non-canonical encodings of a signed envelope, have our adapter
 * quietly rewrite it into canonical form, and watch it validate — the v1 signature-confusion
 * bug class, arriving over the network from an untrusted source, past the exact gate built
 * to foreclose it.
 *
 * So the peer's bytes travel through untouched. This is wire-compatible in both directions:
 * gRPC length-prefixes each message body, so a serialized `jagoo.v1.Envelope` handed through
 * verbatim is byte-identical to what any conforming implementation would frame.
 *
 * Asserted by `federation.e2e.spec.ts`, which delivers a protobuf-valid but NON-canonical
 * encoding of a genuinely signed envelope and requires `MALFORMED` — not acceptance, and
 * not silent repair.
 */

import { FederationDefinition } from '@jagoo/sdk/proto';

/**
 * Structurally a ts-proto message type, semantically an identity function.
 *
 * `decode` COPIES. grpc-js hands over a view into a pooled read buffer, and the bytes must
 * outlive the call — the pipeline is async, and a reused buffer would corrupt an envelope
 * mid-verification in a way that looks like a signature failure and reproduces only under
 * load.
 *
 * Declared as plain function properties, not methods: `fromTsProtoServiceDefinition` reads
 * `requestType.decode` off the object and calls it unbound, so anything relying on `this`
 * would fail at the first frame.
 */
export const RawEnvelopeCodec = {
  encode: (message: Uint8Array) => ({ finish: () => message }),
  decode: (input: Uint8Array): Uint8Array => Uint8Array.from(input),
};

/**
 * `FederationDefinition` with the three `Envelope` slots swapped for the passthrough codec.
 *
 * A spread, because ADR-007 chose a definition object that is an ordinary value. With a
 * runtime proto loader this substitution would be a fight; here it is four lines and the
 * rest of the service keeps its generated codecs, so `Announce`, `ExchangeTreeHeads` and
 * `ExchangeDirectory` are still decoded by the code `buf` generated from the frozen proto.
 */
export const FederationWireDefinition = {
  ...FederationDefinition,
  methods: {
    ...FederationDefinition.methods,
    deliver: {
      ...FederationDefinition.methods.deliver,
      requestType: RawEnvelopeCodec,
    },
    streamActivities: {
      ...FederationDefinition.methods.streamActivities,
      responseType: RawEnvelopeCodec,
    },
    backfill: {
      ...FederationDefinition.methods.backfill,
      responseType: RawEnvelopeCodec,
    },
  },
} as const;

export type FederationWireDefinition = typeof FederationWireDefinition;
