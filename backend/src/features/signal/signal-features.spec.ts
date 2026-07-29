import { describe, expect, it } from 'vitest';
import {
  BroadcastEmit,
  BroadcastRevoke,
  ChannelDeclare,
  CheckIn,
  PrekeyBundle,
  SignalMessage,
  SignalSessionInit,
} from '@jagoo/sdk/proto';
import { channelId } from '@jagoo/sdk';
import {
  ed25519,
  messagingKeyPair,
  openFirstMessage,
  sealFirstMessage,
  signalPrekeySignatureBytes,
} from '@jagoo/sdk/crypto';
import { Plane, Priority } from '../../core/domain/envelope.js';
import { AUTHOR_KEY, NOW_MS, buildHarness, signEnvelope } from '../../testing/harness.js';
import { signalHandlers } from './index.js';
import {
  SIGNAL_CHANNELS_COLLECTION,
  type SignalChannelDoc,
} from './channel/channel.handlers.js';
import {
  SIGNAL_BROADCASTS_COLLECTION,
  defaultSeverityAllows,
  type SignalBroadcastDoc,
} from './broadcast/broadcast.handlers.js';
import {
  SIGNAL_CHECKINS_COLLECTION,
  type SignalCheckInDoc,
} from './crisis/crisis.handlers.js';
import {
  SIGNAL_MESSAGES_COLLECTION,
  SIGNAL_SESSIONS_COLLECTION,
  type SignalMessageDoc,
  type SignalSessionDoc,
} from './message/signal-message.handlers.js';

let nonce = 20;
const nextNonce = (): Uint8Array => new Uint8Array(16).fill((nonce += 1));

async function signalHarness() {
  const harness = await buildHarness((registry, projections) => {
    for (const handler of signalHandlers(projections)) registry.register(handler);
  });
  harness.certificates.add({ plane: Plane.SIGNAL, key: AUTHOR_KEY, issuedAtMs: 0 });
  return harness;
}

async function declareChannel(harness: Awaited<ReturnType<typeof signalHarness>>): Promise<string> {
  const body = ChannelDeclare.encode(
    ChannelDeclare.fromPartial({
      channel_name: 'Dhaka Relief',
      description: 'Verified local relief coordination',
      kind: 2,
      categories: [1, 5, 6],
      signing_key: AUTHOR_KEY,
      kem_public_key: new Uint8Array(1_184).fill(7),
      pq_key: new Uint8Array(1_312).fill(8),
      language: 'bn',
      valid_from: BigInt(NOW_MS),
    }),
  ).finish();
  await harness.pipeline.accept(
    signEnvelope({
      plane: Plane.SIGNAL,
      domain: 'jb:channel:declare:v1',
      scope: '',
      priority: Priority.BULK,
      body,
      pow: new Uint8Array([1]),
      nonce: nextNonce(),
    }),
  );
  return channelId(AUTHOR_KEY);
}

describe('P4 channels and broadcasts', () => {
  it('P4-G2/G3/G5/G12 projects a bounded broadcast, exposes a gap and retains revocation', async () => {
    const h = await signalHarness();
    const channel = await declareChannel(h);
    expect(
      await h.projections
        .collection<SignalChannelDoc>(SIGNAL_CHANNELS_COLLECTION)
        .findOne({ id: channel }),
    ).toMatchObject({ name: 'Dhaka Relief', lastSequence: '0' });

    const emit = (sequence: bigint, headline: string) =>
      signEnvelope({
        plane: Plane.SIGNAL,
        domain: 'jb:broadcast:emit:v1',
        scope: channel,
        priority: Priority.BROADCAST,
        nonce: nextNonce(),
        body: BroadcastEmit.encode(
          BroadcastEmit.fromPartial({
            channel,
            sequence,
            severity: 3,
            category: 1,
            headline,
            expires_at_ms: BigInt(NOW_MS + 3_600_000),
            language: 'bn',
          }),
        ).finish(),
      });

    const firstWire = emit(1n, 'পানি বাড়ছে');
    expect(firstWire.length).toBeLessThanOrEqual(512);
    const first = await h.pipeline.accept(firstWire);
    const third = await h.pipeline.accept(emit(3n, 'এখনই উঁচু জায়গায় যান'));

    const broadcasts =
      h.projections.collection<SignalBroadcastDoc>(SIGNAL_BROADCASTS_COLLECTION);
    expect(await broadcasts.findOne({ id: third.contentId })).toMatchObject({
      sequence: '3',
      previousSequence: '1',
    });

    await h.pipeline.accept(
      signEnvelope({
        plane: Plane.SIGNAL,
        domain: 'jb:broadcast:revoke:v1',
        scope: channel,
        priority: Priority.BROADCAST,
        nonce: nextNonce(),
        body: BroadcastRevoke.encode(
          BroadcastRevoke.fromPartial({
            channel,
            target: first.contentId,
            reason: 1,
            note: 'False alarm',
          }),
        ).finish(),
      }),
    );
    expect(await broadcasts.findOne({ id: first.contentId })).toMatchObject({
      headline: 'পানি বাড়ছে',
      revokeReason: 1,
      revokeNote: 'False alarm',
    });
  });

  it('P4-G4 filters an unverified CRITICAL broadcast by default without relying on colour', () => {
    expect(defaultSeverityAllows(4, 'unverified')).toBe(false);
    expect(defaultSeverityAllows(4, 'known')).toBe(true);
    expect(defaultSeverityAllows(3, 'unverified')).toBe(true);
  });
});

describe('P4 crisis and identified messaging', () => {
  it('P4-G11 accepts a check-in with no anti-abuse credential or credit proof', async () => {
    const h = await signalHarness();
    const result = await h.pipeline.accept(
      signEnvelope({
        plane: Plane.SIGNAL,
        domain: 'jb:checkin:post:v1',
        scope: '',
        priority: Priority.CHECKIN,
        nonce: nextNonce(),
        body: CheckIn.encode(
          CheckIn.fromPartial({ status: 1, note: 'Safe at the school shelter' }),
        ).finish(),
      }),
    );
    expect(
      await h.projections
        .collection<SignalCheckInDoc>(SIGNAL_CHECKINS_COLLECTION)
        .findOne({ id: result.contentId }),
    ).toMatchObject({ status: 1, note: 'Safe at the school shelter' });
  });

  it('P4-G6/G7 stores only hybrid ciphertext for an offline recipient', async () => {
    const h = await signalHarness();
    const recipientSeed = new Uint8Array(32).fill(9);
    const recipientKey = ed25519.derivePublicKey(recipientSeed);
    h.certificates.add({ plane: Plane.SIGNAL, key: recipientKey, issuedAtMs: 0 });
    const recipientMessaging = messagingKeyPair(
      new Uint8Array(32).fill(10),
      new Uint8Array(64).fill(11),
    );
    const signedPrekey = recipientMessaging.publicKey.x25519;
    const validUntilMs = BigInt(NOW_MS + 86_400_000);
    const signature = ed25519.sign(
      signalPrekeySignatureBytes({
        identityKey: recipientKey,
        signedPrekey,
        kemPublicKey: recipientMessaging.publicKey.mlKem768,
        validUntilMs,
      }),
      recipientSeed,
    );
    const plaintext = new TextEncoder().encode('Meet at the eastern shelter');
    const sealed = sealFirstMessage(
      recipientMessaging.publicKey,
      plaintext,
      new TextEncoder().encode('signal-session'),
      new Uint8Array(32).fill(12),
      new Uint8Array(32).fill(13),
      new Uint8Array(12).fill(14),
    );

    await h.pipeline.accept(
      signEnvelope({
        seed: recipientSeed,
        plane: Plane.SIGNAL,
        domain: 'jb:message:prekeys:v1',
        scope: '',
        priority: Priority.BULK,
        nonce: nextNonce(),
        body: PrekeyBundle.encode(
          PrekeyBundle.fromPartial({
            identity_key: recipientKey,
            signed_prekey: signedPrekey,
            signed_prekey_sig: signature,
            kem_public_key: recipientMessaging.publicKey.mlKem768,
            valid_until_ms: validUntilMs,
          }),
        ).finish(),
      }),
    );

    const sessionReceipt = await h.pipeline.accept(
      signEnvelope({
        plane: Plane.SIGNAL,
        domain: 'jb:message:session:v1',
        scope: '',
        priority: Priority.DIRECT,
        nonce: nextNonce(),
        body: SignalSessionInit.encode(
          SignalSessionInit.fromPartial({
            recipient_key: recipientKey,
            kem_ciphertext: sealed.kemCiphertext,
            ephemeral_x25519: sealed.ephemeralX25519,
            ciphertext: sealed.ciphertext,
          }),
        ).finish(),
      }),
    );

    await h.pipeline.accept(
      signEnvelope({
        plane: Plane.SIGNAL,
        domain: 'jb:message:signal:v1',
        scope: '',
        priority: Priority.DIRECT,
        nonce: nextNonce(),
        body: SignalMessage.encode(
          SignalMessage.fromPartial({
            session: sessionReceipt.contentId,
            counter: 0n,
            header: new Uint8Array([1, 2]),
            ciphertext: new Uint8Array(32).fill(6),
          }),
        ).finish(),
      }),
    );

    const session = await h.projections
      .collection<SignalSessionDoc>(SIGNAL_SESSIONS_COLLECTION)
      .findOne({ id: sessionReceipt.contentId });
    const messages = await h.projections
      .collection<SignalMessageDoc>(SIGNAL_MESSAGES_COLLECTION)
      .find({}, 10);
    expect(session?.ciphertext).toBeTruthy();
    expect(messages).toHaveLength(1);
    expect(
      new TextDecoder().decode(
        openFirstMessage(
          recipientMessaging.secretKey,
          sealed,
          new TextEncoder().encode('signal-session'),
        ),
      ),
    ).toBe('Meet at the eastern shelter');
    expect(JSON.stringify({ session, messages })).not.toContain('plaintext');
    expect(JSON.stringify({ session, messages })).not.toContain('Meet at the eastern shelter');
  });
});

describe('ADR-012 certificate isolation', () => {
  it('P4-G9 does not accept a Forum certificate for the same Signal key', async () => {
    const h = await buildHarness((registry, projections) => {
      for (const handler of signalHandlers(projections)) registry.register(handler);
    });
    await expect(
      h.pipeline.accept(
        signEnvelope({
          plane: Plane.SIGNAL,
          domain: 'jb:checkin:post:v1',
          scope: '',
          priority: Priority.CHECKIN,
          body: CheckIn.encode(CheckIn.fromPartial({ status: 1 })).finish(),
        }),
      ),
    ).rejects.toMatchObject({ code: 'NO_CERTIFICATE' });
  });
});
