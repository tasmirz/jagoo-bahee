import { ChannelCredentials } from '@grpc/grpc-js';
import { createChannel, createClient } from 'nice-grpc';
import {
  ReticulumBridgeDefinition,
  type BridgeStatus,
  type InboundEnvelope,
  type SendResp,
} from '@jagoo/sdk/proto';
import { decodeSignedEnvelope } from '@jagoo/sdk/core';
import {
  ReachabilityScope,
  AuxiliaryTransportOut,
  Transport,
  type PeerEndpoint,
  type TransportInboundMeta,
  type TransportProbe,
} from '../../../core/ports/network.port.js';
import { Priority } from '../../../core/domain/envelope.js';

export interface ReticulumClient {
  send(request: {
    readonly envelope: Uint8Array;
    readonly destination_hash: string;
    readonly priority: number;
  }, options?: { readonly deadline?: Date }): Promise<SendResp>;
  receive(
    request: { readonly destination_hash: string },
    options?: { readonly signal?: AbortSignal },
  ): AsyncIterable<InboundEnvelope>;
  status(
    request: Record<string, never>,
    options?: { readonly deadline?: Date },
  ): Promise<BridgeStatus>;
}

export class TransportUnsupportedError extends Error {
  readonly code = 'TRANSPORT_UNSUPPORTED';

  constructor(detail: string) {
    super(detail);
    this.name = 'TransportUnsupportedError';
  }
}

export class ReticulumTransport extends Transport {
  readonly id = 'reticulum';
  readonly scopes = [ReachabilityScope.RETICULUM] as const;
  readonly classes = [Priority.BROADCAST, Priority.DIRECT, Priority.CHECKIN] as const;
  readonly mtu = 220;
  private readonly client: ReticulumClient;

  constructor(
    address: string,
    private readonly destinationHash: string,
    client?: ReticulumClient,
  ) {
    super();
    this.client =
      client ??
      (createClient(
        ReticulumBridgeDefinition,
        createChannel(address, ChannelCredentials.createInsecure()),
      ) as unknown as ReticulumClient);
  }

  async available(): Promise<boolean> {
    try {
      await this.client.status({}, { deadline: new Date(Date.now() + 1_500) });
      return true;
    } catch {
      return false;
    }
  }

  async send(raw: Uint8Array, endpoint: PeerEndpoint): Promise<void> {
    const envelope = decodeSignedEnvelope(raw);
    if (!this.classes.includes(envelope.priority as (typeof this.classes)[number])) {
      throw new TransportUnsupportedError('Reticulum carries BROADCAST, DIRECT and CHECKIN only');
    }
    const destination = endpoint.address.startsWith('rns://')
      ? endpoint.address.slice('rns://'.length)
      : this.destinationHash;
    const response = await this.client.send(
      {
        envelope: raw,
        destination_hash: destination,
        priority: envelope.priority,
      },
      { deadline: new Date(Date.now() + 5_000) },
    );
    if (!response.accepted) {
      throw new TransportUnsupportedError(`relay rejected envelope with code ${response.code}`);
    }
  }

  subscribe(
    onEnvelope: (raw: Uint8Array, meta: TransportInboundMeta) => void,
  ): () => void {
    const controller = new AbortController();
    void (async () => {
      try {
        for await (const inbound of this.client.receive(
          // The configured hash is the remote fanout destination. Receive()
          // streams packets delivered to this sidecar's own announced
          // destination, so an empty filter is intentional.
          { destination_hash: '' },
          { signal: controller.signal },
        )) {
          onEnvelope(inbound.envelope, {
            transportId: this.id,
            scope: ReachabilityScope.RETICULUM,
            peer: inbound.source_hash,
            hops: inbound.hops,
          });
        }
      } catch {
        // A crashed optional sidecar leaves every other transport running.
      }
    })();
    return () => controller.abort();
  }

  async probe(_endpoint: PeerEndpoint): Promise<TransportProbe> {
    const started = Date.now();
    const reachable = await this.available();
    return {
      reachable,
      ...(reachable ? { rttMs: Date.now() - started } : {}),
      scope: ReachabilityScope.RETICULUM,
      via: this.id,
    };
  }

  status(): Promise<BridgeStatus> {
    return this.client.status({}, { deadline: new Date(Date.now() + 1_500) });
  }
}

export class ReticulumFanout extends AuxiliaryTransportOut {
  constructor(
    private readonly transport: ReticulumTransport | null,
    private readonly destinationHash: string,
  ) {
    super();
  }

  async fanout(raw: Uint8Array): Promise<void> {
    if (!this.transport) return;
    const envelope = decodeSignedEnvelope(raw);
    if (!this.transport.classes.includes(envelope.priority as 1 | 2 | 3)) return;
    await this.transport.send(raw, {
      address: `rns://${this.destinationHash}`,
      scope: ReachabilityScope.RETICULUM,
    });
  }
}
