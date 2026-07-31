import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Plane,
  Priority,
  buildEnvelope,
  canonicalBytes,
  sealEnvelope,
} from '@jagoo/sdk';
import { ed25519 } from '@jagoo/sdk/crypto';
import type { DiscoveredService } from '../data/node-config';
import {
  drainOutbox,
  enqueueSignedEnvelope,
  listOutbox,
  orderOutbox,
  submitSignedEnvelope,
  type OutboxRecord,
} from './outbox';

const record = (id: string, priority: Priority, queuedAtMs: number): OutboxRecord => ({
  contentId: id,
  plane: Plane.FORUM,
  priority,
  envelope: 'AA==',
  baseUrl: 'http://node.test',
  auditServices: [],
  queuedAtMs,
  attempts: 0,
  nextAttemptAtMs: 0,
  state: 'pending',
});

describe('durable offline outbox', () => {
  afterEach(async () => AsyncStorage.clear());

  it('P5-G5 drains a broadcast before a bulk backlog', () => {
    const bulk = Array.from({ length: 500 }, (_, index) =>
      record(`jb1bulk${index}`, Priority.BULK, index),
    );
    expect(orderOutbox([...bulk, record('jb1critical', Priority.BROADCAST, 999)])[0]?.contentId)
      .toBe('jb1critical');
  });

  it('P5-G1 assigns final signed IDs offline for every required authoring shape', async () => {
    const forumSeed = new Uint8Array(32).fill(3);
    const signalSeed = new Uint8Array(32).fill(4);
    const cases = [
      ['jb:post:create:v1', Plane.FORUM, forumSeed],
      ['jb:comment:create:v1', Plane.FORUM, forumSeed],
      ['jb:vote:cast:v1', Plane.FORUM, forumSeed],
      ['jb:message:session:v1', Plane.SIGNAL, signalSeed],
      ['jb:broadcast:emit:v1', Plane.SIGNAL, signalSeed],
      ['jb:checkin:post:v1', Plane.SIGNAL, signalSeed],
    ] as const;
    const expected: string[] = [];
    for (const [domain, plane, seed] of cases) {
      const unsigned = buildEnvelope({
        domain,
        plane,
        authorKey: ed25519.derivePublicKey(seed),
        body: new Uint8Array([1]),
        nowMs: 1_000n,
        nonce: new Uint8Array(16).fill(expected.length + 1),
      });
      const sealed = sealEnvelope(unsigned, ed25519.sign(canonicalBytes(unsigned), seed));
      expected.push(sealed.contentId);
      await enqueueSignedEnvelope({
        contentId: sealed.contentId,
        plane,
        priority: unsigned.priority,
        wireBytes: sealed.wireBytes,
        baseUrl: 'http://offline.node',
      });
    }
    const queued = await listOutbox();
    expect(new Set(queued.map((item) => item.contentId))).toEqual(new Set(expected));
    expect(queued.every((item) => item.state === 'pending')).toBe(true);
  });

  it('queues exact signed bytes before a failed send and recovers them after restart', async () => {
    const input = {
      contentId: 'jb1pending',
      plane: Plane.SIGNAL,
      priority: Priority.CHECKIN,
      wireBytes: new Uint8Array([1, 2, 3]),
      baseUrl: 'http://node.test',
    };
    const result = await submitSignedEnvelope(input, async () => {
      throw new Error('offline');
    });
    expect(result.pending).toBe(true);
    expect(await listOutbox()).toHaveLength(1);
  });

  it('P5-G4 deduplicates by final content ID and records the original receipt', async () => {
    const input = {
      contentId: 'jb1same',
      plane: Plane.FORUM,
      priority: Priority.DIRECT,
      wireBytes: new Uint8Array([9]),
      baseUrl: 'http://node.test',
    };
    await enqueueSignedEnvelope(input);
    await enqueueSignedEnvelope(input);
    const seen: string[] = [];
    const receipt = {
      content_id: 'jb1same',
      log_index: 3,
      leaf_index: 2,
      accepted_at_ms: 1,
      server_id: 'jbs1test',
      server_key: '',
      signature: '',
      sth: {
        tree_size: 1,
        server_key: '',
        root_hash: '',
        timestamp_ms: 1,
        signature: '',
      },
      inclusion_proof: [],
    };
    const result = await drainOutbox(async (_baseUrl, body) => {
      seen.push(body);
      return receipt;
    });
    expect(seen).toHaveLength(1);
    expect(result.receipted).toBe(1);
    expect(await listOutbox()).toHaveLength(0);
  });

  /**
   * A private message must never be copied to an audit log.
   *
   * `createAuditCertificate` embeds the ENTIRE signed envelope in `request.body_base64` —
   * that is what makes a node's refusal to publish provable. For a `SignalMessage` or
   * `SignalSessionInit` that envelope carries `recipient_key` in the clear plus the sender's
   * identified Signal key and a timestamp, so forwarding it hands every advertised audit
   * service a timestamped social graph of who messages whom. This project refuses to build
   * that structure server-side; shipping it to an outside service is strictly worse, and a
   * message nobody else can read has no censorship claim to prove in the first place.
   *
   * The certificate is still written locally either way. Only the copies are withheld.
   */
  const receiptFor = (contentId: string) => ({
    content_id: contentId,
    log_index: 1,
    leaf_index: 0,
    accepted_at_ms: 1,
    server_id: 'jbs1test',
    server_key: '',
    signature: '',
    sth: { tree_size: 1, server_key: '', root_hash: '', timestamp_ms: 1, signature: '' },
    inclusion_proof: [],
  });

  const auditService: DiscoveredService = {
    id: 'als',
    kind: 'audit-log',
    address: 'http://als.test',
    host: 'als.test',
    port: 80,
    available: true,
  };

  it('never forwards a DIRECT envelope to an audit log', async () => {
    const posted: string[] = [];
    globalThis.fetch = (async (url: string) => {
      posted.push(String(url));
      return { ok: true, status: 200, json: async () => ({}) };
    }) as unknown as typeof fetch;

    const result = await submitSignedEnvelope(
      {
        contentId: 'jb1dm',
        plane: Plane.SIGNAL,
        priority: Priority.DIRECT,
        wireBytes: new Uint8Array([7]),
        baseUrl: 'http://node.test',
        auditServices: [auditService],
      },
      async () => receiptFor('jb1dm'),
    );

    expect(result.pending).toBe(false);
    expect(posted.filter((url) => url.includes('als.test'))).toEqual([]);
    expect(result.auditCopies).toBe(0);
    // Still recorded on this device — withholding the copies is not withholding the proof.
    const stored = await AsyncStorage.getItem('jb.audit-certificate.v1:jb1dm');
    expect(stored).not.toBeNull();
  });

  it('still forwards a public post, or the gate would only prove nothing is forwarded', async () => {
    const posted: string[] = [];
    globalThis.fetch = (async (url: string) => {
      posted.push(String(url));
      return { ok: true, status: 200, json: async () => ({}) };
    }) as unknown as typeof fetch;

    await submitSignedEnvelope(
      {
        contentId: 'jb1post',
        plane: Plane.FORUM,
        priority: Priority.BULK,
        wireBytes: new Uint8Array([8]),
        baseUrl: 'http://node.test',
        auditServices: [auditService],
      },
      async () => receiptFor('jb1post'),
    );

    expect(posted.filter((url) => url.includes('als.test'))).toHaveLength(1);
  });
});
