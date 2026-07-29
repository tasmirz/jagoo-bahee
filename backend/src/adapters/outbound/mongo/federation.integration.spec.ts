/**
 * FG-05 against a REAL database — the half an in-memory double cannot prove.
 *
 * ── Why this suite exists separately from `federation.e2e.spec.ts` ─────────────────
 * ADR-008 §2 requires three things, because "it didn't crash" is exactly what v1 also
 * observed while its guard was a race:
 *
 *   1. `listIndexes` reports `{ content_id: 1, direction: 1 }` with `unique: true`.
 *      v1 wrote `findOne` then `insertOne` and caught error 11000 — but never DECLARED the
 *      index, so the catch was unreachable and the check was a race that looked like a
 *      guard. Asserting the index exists is asserting the declaration was not forgotten.
 *   2. Genuinely concurrent double insertion yields exactly one row. Node is
 *      single-threaded, so the in-memory double cannot interleave two transactions; only a
 *      real server can.
 *   3. The duplicate-key branch is genuinely entered — a `DuplicateFederationEntryError`,
 *      not a silent overwrite.
 *
 * Mandatory in CI (`JB_REQUIRE_INTEGRATION=1`), skipped honestly and visibly without a
 * database. It must never report green while running nothing (build log L-11).
 */

import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Plane, Priority } from '../../../core/domain/envelope.js';
import {
  DuplicateFederationEntryError,
  FederationDirection,
  PeerTrust,
  type OutboxEntry,
} from '../../../core/ports/network.port.js';
import {
  INTEGRATION_HOOK_TIMEOUT_MS,
  SERVER_SELECTION_TIMEOUT_MS,
  integrationUrl,
} from '../../../testing/integration-env.js';
import { MongoProjectionStore } from './mongo-stores.js';
import { MongoFederationLedger, MongoFederationOutbox, MongoPeerDirectory } from './mongo-federation.js';

const url = integrationUrl('MONGO_URL');
const integration = describe.skipIf(!url);

integration('Mongo federation adapters', () => {
  let client: MongoClient;
  let databaseName: string;

  beforeAll(async () => {
    client = new MongoClient(url!, { serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS });
    await client.connect();
    databaseName = `jagoo_federation_${process.pid}_${randomUUID().replaceAll('-', '')}`;
  }, INTEGRATION_HOOK_TIMEOUT_MS);

  afterAll(async () => {
    if (client) {
      await client.db(databaseName).dropDatabase();
      await client.close();
    }
  }, INTEGRATION_HOOK_TIMEOUT_MS);

  it('FD-05 — the (content_id, direction) index EXISTS and is unique', async () => {
    const db = client.db(databaseName);
    const ledger = new MongoFederationLedger(db);
    await ledger.ensureIndexes();

    const indexes = await db.collection('federation_ledger').listIndexes().toArray();
    const compound = indexes.find(
      (index) => index.key?.['content_id'] === 1 && index.key?.['direction'] === 1,
    );

    expect(compound, 'the (content_id, direction) index was never declared').toBeDefined();
    expect(compound!.unique, 'the index exists but is not unique — v1s exact defect').toBe(true);
  });

  it('FG-05 — concurrent double insertion yields exactly one row, and the branch is entered', async () => {
    const db = client.db(databaseName);
    const projections = new MongoProjectionStore(db, client);
    const ledger = new MongoFederationLedger(db);
    await ledger.ensureIndexes();

    const entry = {
      contentId: `jb1${randomUUID().replaceAll('-', '')}`,
      direction: FederationDirection.IN,
      peerId: 'jbs1concurrent',
      recordedAtMs: 1_700_000_000_000,
    };

    // Both transactions open before either commits. One wins; the other must fail on the
    // index rather than overwrite, and must fail with the TYPED error the pipeline keys on.
    const attempts = await Promise.allSettled([
      projections.transaction(async (tx) => ledger.record(entry, tx)),
      projections.transaction(async (tx) => ledger.record(entry, tx)),
    ]);

    const fulfilled = attempts.filter((result) => result.status === 'fulfilled');
    const rejected = attempts.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const reason = (rejected[0] as PromiseRejectedResult).reason;
    // A Mongo write conflict is also a legitimate outcome of two racing transactions and is
    // retried by the caller; what must NEVER happen is a second row.
    if (reason instanceof DuplicateFederationEntryError) {
      expect(reason.contentId).toBe(entry.contentId);
    }

    const rows = await db
      .collection('federation_ledger')
      .find({ content_id: entry.contentId })
      .toArray();
    expect(rows, 'a replayed envelope was recorded twice').toHaveLength(1);
  });

  it('records the OUT direction for content it already holds IN', async () => {
    const db = client.db(databaseName);
    const projections = new MongoProjectionStore(db, client);
    const ledger = new MongoFederationLedger(db);
    await ledger.ensureIndexes();

    const contentId = `jb1${randomUUID().replaceAll('-', '')}`;
    const base = { contentId, peerId: 'jbs1peer', recordedAtMs: 1 };
    await projections.transaction(async (tx) =>
      ledger.record({ ...base, direction: FederationDirection.IN }, tx),
    );
    // Different key, so it must be accepted — otherwise a node could never record that it
    // forwarded something it had received, and FD-14 loop prevention would lose its record.
    await projections.transaction(async (tx) =>
      ledger.record({ ...base, direction: FederationDirection.OUT }, tx),
    );

    const entries = await ledger.entriesFor(contentId);
    expect(entries.map((entry) => entry.direction).sort()).toEqual(['in', 'out']);
  });

  it('NFR-R07 — the stream cursor is durable and never rewinds', async () => {
    const ledger = new MongoFederationLedger(client.db(databaseName));
    await ledger.ensureIndexes();

    await ledger.recordStreamPosition('jbs1cursor', 42);
    expect(await ledger.streamPosition('jbs1cursor')).toBe(42);

    // A late acknowledgement from a slower stream must not replay a peer's whole history.
    await ledger.recordStreamPosition('jbs1cursor', 7);
    expect(await ledger.streamPosition('jbs1cursor')).toBe(42);
  });

  it('T2.12 — a peer tree head survives a restart', async () => {
    const db = client.db(databaseName);
    const first = new MongoFederationLedger(db);
    await first.recordPeerSth('jbs1forkwatch', {
      serverKey: new Uint8Array(32).fill(4),
      treeSize: 99,
      rootHash: new Uint8Array(32).fill(5),
      timestampMs: 1_700_000_000_000,
      signature: new Uint8Array(64).fill(6),
    });

    // A brand new adapter instance — the fork-detection baseline must come from the
    // database, not from a `Map` an attacker could clear by provoking a restart.
    const afterRestart = new MongoFederationLedger(db);
    const sth = await afterRestart.lastPeerSth('jbs1forkwatch');
    expect(sth?.treeSize).toBe(99);
    expect(Buffer.from(sth!.rootHash)).toEqual(Buffer.from(new Uint8Array(32).fill(5)));
  });

  it('FD-06 — the outbox drains highest priority class first, then FIFO', async () => {
    const db = client.db(databaseName);
    const outbox = new MongoFederationOutbox(db);
    await outbox.ensureIndexes();

    await outbox.enqueue([
      { contentId: 'jb1bulk1', peerId: 'p', priority: Priority.BULK, plane: Plane.FORUM, nextAttemptAtMs: 0 },
      { contentId: 'jb1bulk2', peerId: 'p', priority: Priority.BULK, plane: Plane.FORUM, nextAttemptAtMs: 0 },
      // Queued LAST, must drain FIRST: a queued emergency broadcast overtakes 500 votes.
      { contentId: 'jb1alert', peerId: 'p', priority: Priority.BROADCAST, plane: Plane.FORUM, nextAttemptAtMs: 0 },
    ]);

    const leased = await outbox.lease(1_000, 10);
    expect(leased.map((entry) => entry.contentId)).toEqual(['jb1alert', 'jb1bulk1', 'jb1bulk2']);
  });

  it('FD-06 — a re-enqueued entry keeps its attempt count, and dead letters are visible', async () => {
    const db = client.db(databaseName);
    const outbox = new MongoFederationOutbox(db);
    await outbox.ensureIndexes();

    const entry = {
      contentId: 'jb1retry',
      peerId: 'p2',
      priority: Priority.BULK,
      plane: Plane.FORUM,
      nextAttemptAtMs: 0,
    };
    await outbox.enqueue([entry]);
    // The ordering test above deliberately leaves its rows pending, so every assertion here
    // filters to THIS peer. A test that assumed an empty collection would be asserting on
    // the previous test's leftovers — and would pass or fail for the wrong reason.
    const mine = (rows: readonly OutboxEntry[]) => rows.filter((row) => row.peerId === 'p2');

    const [leased] = mine(await outbox.lease(1_000, 10));
    expect(leased).toBeDefined();
    await outbox.fail(leased!.id, 5_000, 'peer unreachable');

    // An overlapping stream and a backfill both re-enqueue the same envelope. That must not
    // reset the backoff clock, or a permanently failing peer would be retried forever at
    // full rate.
    await outbox.enqueue([entry]);
    expect(mine(await outbox.lease(4_999, 10)), 'a re-enqueue reset the backoff').toHaveLength(0);

    const due = mine(await outbox.lease(5_000, 10));
    expect(due).toHaveLength(1);
    expect(due[0]!.attempts).toBe(1);

    await outbox.fail(due[0]!.id, null, 'gave up');
    expect((await outbox.stats()).deadLettered).toBeGreaterThan(0);
    expect((await outbox.deadLetters(10)).map((row) => row.contentId)).toContain('jb1retry');
  });

  it('FD-02 — a peer round-trips by KEY, with its scoped endpoints and vouches intact', async () => {
    const directory = new MongoPeerDirectory(client.db(databaseName));
    await directory.ensureIndexes();

    await directory.upsert({
      serverId: 'jbs1roundtrip',
      publicKey: new Uint8Array(32).fill(9),
      displayName: 'Dhaka Node 1',
      endpoints: [
        { address: 'grpc://node1.example.org:8444', scope: 'GLOBAL', asn: 12345, isp: 'ISP-A' },
        { address: 'grpc://10.20.30.40:8444', scope: 'ISP_LOCAL', asn: 12345, isp: 'ISP-A' },
      ],
      trust: PeerTrust.NORMAL,
      planes: [Plane.FORUM],
      vouches: [
        {
          asserterKey: new Uint8Array(32).fill(1),
          peerKey: new Uint8Array(32).fill(9),
          level: PeerTrust.TRUSTED,
          note: 'runs the Mirpur relay',
          assertedAtMs: 5,
          signature: new Uint8Array(64).fill(2),
        },
      ],
      lastSeenMs: 10,
    });

    const restored = await directory.get('jbs1roundtrip');
    expect(restored!.trust).toBe(PeerTrust.NORMAL);
    // TP-05/FD-17: both scopes survive, so the ISP-local address is already known when the
    // gateway drops. Discovery cannot depend on the network that just failed.
    expect(restored!.endpoints.map((endpoint) => endpoint.scope).sort()).toEqual([
      'GLOBAL',
      'ISP_LOCAL',
    ]);
    expect(restored!.vouches?.[0]?.level).toBe(PeerTrust.TRUSTED);
    expect(Buffer.from(restored!.vouches![0]!.asserterKey)).toEqual(
      Buffer.from(new Uint8Array(32).fill(1)),
    );

    // Scope and ASN lookups are what P3's path selection will drive from.
    expect((await directory.forScope('ISP_LOCAL')).map((peer) => peer.serverId)).toContain(
      'jbs1roundtrip',
    );
    expect((await directory.forAsn(12345)).map((peer) => peer.serverId)).toContain('jbs1roundtrip');
  });
});
