/**
 * The `Federation` RPC surface, written out in terms of the generated message types.
 *
 * ── Why this interface exists, when the definition is already generated ─────────────
 * ts-proto's `fromPartial<I extends Exact<DeepPartial<T>, I>>` is precise when TypeScript
 * infers `I` from a literal at the call site. nice-grpc derives its request/response types
 * with `Parameters<Type['fromPartial']>[0]`, which resolves that generic to its own
 * constraint — producing intersections like `string[] & { [x: string]: never }` that no
 * value can satisfy. The types become unusable while the runtime is entirely fine.
 *
 * The honest fix is to state the contract once, in the generated message types, and cast
 * only where the two type systems meet (`server.add` and `createClient`). Every message is
 * still constructed through the generated `fromPartial`, so the shapes are still checked
 * against `proto/jagoo/v1/federation.proto` — what is lost is nice-grpc's own inference,
 * not our contract. Scattering `as never` through the adapter would lose both.
 *
 * If `federation.proto` gains or changes a method, this interface fails to compile against
 * the generated types, which is exactly the signal a hand-written mirror needs to be safe.
 */

import type { CallOptions } from 'nice-grpc-common';
import type { CallContext } from 'nice-grpc';
import type {
  AnnounceRequest,
  AnnounceResponse,
  BackfillRequest,
  DeliverAck,
  DirectoryExchange,
  StreamRequest,
  TreeHeadExchange,
} from '@jagoo/sdk/proto';

/**
 * `Envelope` is `Uint8Array` on all three streaming methods — the passthrough codec from
 * ADR-008 §1. That substitution is visible here on purpose: a reader of this file should
 * see immediately that peer bytes are never re-encoded.
 */
export interface FederationRpcClient {
  announce(request: AnnounceRequest, options?: CallOptions): Promise<AnnounceResponse>;
  deliver(frames: AsyncIterable<Uint8Array>, options?: CallOptions): Promise<DeliverAck>;
  streamActivities(request: StreamRequest, options?: CallOptions): AsyncIterable<Uint8Array>;
  backfill(request: BackfillRequest, options?: CallOptions): AsyncIterable<Uint8Array>;
  exchangeTreeHeads(
    request: TreeHeadExchange,
    options?: CallOptions,
  ): Promise<TreeHeadExchange>;
  exchangeDirectory(
    request: DirectoryExchange,
    options?: CallOptions,
  ): Promise<DirectoryExchange>;
}

export interface FederationRpcServer {
  announce(request: AnnounceRequest, context: CallContext): Promise<AnnounceResponse>;
  deliver(frames: AsyncIterable<Uint8Array>, context: CallContext): Promise<DeliverAck>;
  streamActivities(request: StreamRequest, context: CallContext): AsyncIterable<Uint8Array>;
  backfill(request: BackfillRequest, context: CallContext): AsyncIterable<Uint8Array>;
  exchangeTreeHeads(request: TreeHeadExchange, context: CallContext): Promise<TreeHeadExchange>;
  exchangeDirectory(request: DirectoryExchange, context: CallContext): Promise<DirectoryExchange>;
}
