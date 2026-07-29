import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BroadcastEmit, ChannelDeclare } from '@jagoo/sdk/proto';
import { channelId, Plane as SdkPlane } from '@jagoo/sdk/core';
import { ed25519 } from '@jagoo/sdk/crypto';
import { Plane, Priority } from '../../core/domain/envelope.js';
import { PeerTrust } from '../../core/ports/network.port.js';
import { AUTHOR_KEY, AUTHOR_SEED, NOW_MS, certifyEnvelope, signEnvelope } from '../../testing/harness.js';
import {
  introduce,
  peerIdOf,
  startNode,
  stopNode,
  type FederatedNode,
} from '../../federation/two-node-harness.js';
import {
  SIGNAL_BROADCASTS_COLLECTION,
  type SignalBroadcastDoc,
} from './broadcast/broadcast.handlers.js';

let a: FederatedNode;
let b: FederatedNode;
let nonce = 120;

beforeEach(async () => {
  a = await startNode({ name: 'signal-a', seed: 0x41 });
  b = await startNode({ name: 'signal-b', seed: 0x42 });
  await introduce(a, b, PeerTrust.NORMAL);
  await introduce(b, a, PeerTrust.NORMAL);
  await a.sender.announce((await a.peers.get(peerIdOf(b)))!);
  await b.sender.announce((await b.peers.get(peerIdOf(a)))!);
  await a.peers.upsert({ ...(await a.peers.get(peerIdOf(b)))!, trust: PeerTrust.NORMAL });
  await b.peers.upsert({ ...(await b.peers.get(peerIdOf(a)))!, trust: PeerTrust.NORMAL });
});

afterEach(async () => {
  await stopNode(a);
  await stopNode(b);
});

describe('P4-G2 — Signal broadcast federation', () => {
  it('projects an identified alert from node A on independent node B', async () => {
    await a.pipeline.accept(certifyEnvelope({ plane: SdkPlane.SIGNAL }));
    await a.outbox.drain();

    const channel = channelId(AUTHOR_KEY);
    await a.pipeline.accept(
      signEnvelope({
        seed: AUTHOR_SEED,
        plane: Plane.SIGNAL,
        domain: 'jb:channel:declare:v1',
        scope: '',
        priority: Priority.BULK,
        nonce: new Uint8Array(16).fill((nonce += 1)),
        pow: new Uint8Array([1]),
        body: ChannelDeclare.encode(
          ChannelDeclare.fromPartial({
            channel_name: 'Relief coordination',
            description: 'Two-node P4 gate',
            kind: 2,
            signing_key: ed25519.derivePublicKey(AUTHOR_SEED),
            kem_public_key: new Uint8Array(1_184).fill(3),
            pq_key: new Uint8Array(1_312).fill(4),
            language: 'bn',
            valid_from: BigInt(NOW_MS),
          }),
        ).finish(),
      }),
    );
    await a.outbox.drain();

    const receipt = await a.pipeline.accept(
      signEnvelope({
        seed: AUTHOR_SEED,
        plane: Plane.SIGNAL,
        domain: 'jb:broadcast:emit:v1',
        scope: channel,
        priority: Priority.BROADCAST,
        nonce: new Uint8Array(16).fill((nonce += 1)),
        body: BroadcastEmit.encode(
          BroadcastEmit.fromPartial({
            channel,
            sequence: 1n,
            severity: 3,
            category: 1,
            headline: 'নিরাপদ স্থানে যান',
            expires_at_ms: BigInt(NOW_MS + 3_600_000),
            language: 'bn',
          }),
        ).finish(),
      }),
    );
    await a.outbox.drain();

    expect(
      await b.projections
        .collection<SignalBroadcastDoc>(SIGNAL_BROADCASTS_COLLECTION)
        .findOne({ id: receipt.contentId }),
    ).toMatchObject({
      channel,
      sequence: '1',
      headline: 'নিরাপদ স্থানে যান',
    });
  });
});
