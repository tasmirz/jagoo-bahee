import { describe, expect, it } from 'vitest';
import { CommunityCreate, PostCreate } from '@jagoo/sdk/proto';
import { ed25519 } from '@jagoo/sdk/crypto';
import { DomainRegistry } from '../domain/domain-registry.js';
import { ProjectionRebuilder } from './projection-rebuilder.js';
import {
  AUTHOR_SEED,
  buildHarness,
  signEnvelope,
} from '../../testing/harness.js';
import { forumHandlers } from '../../features/forum/index.js';
import { InMemoryProjectionStore } from '../../adapters/outbound/in-memory/in-memory-stores.js';
import { InMemoryNodeSigner } from '../../adapters/outbound/in-memory/in-memory-node.js';

describe('rebuild-projections (T1.6)', () => {
  it('P1-G3 — recreates every populated collection byte-identically', async () => {
    const source = await buildHarness((registry, projections) => {
      for (const handler of forumHandlers(projections, new InMemoryNodeSigner())) {
        registry.register(handler);
      }
    });
    const authorKey = ed25519.derivePublicKey(AUTHOR_SEED);
    source.certificates.add({ key: authorKey, issuedAtMs: 0 });
    await source.credentials.issue(new Uint8Array([1, 2, 3, 4]));
    const gates = {
      credential: new Uint8Array([0xfe, 0xfd, 0xfc, 0xfb]),
      nullifier: new Uint8Array(16).fill(1),
      epoch: 1,
      pow: new Uint8Array([1]),
    };
    await source.pipeline.accept(
      signEnvelope({
        domain: 'jb:community:create:v1',
        body: CommunityCreate.encode(
          CommunityCreate.fromPartial({ name: 'rebuild_test', title: 'Rebuild Test' }),
        ).finish(),
        ...gates,
      }),
    );
    const community = `rebuild_test@${source.nodeSigner.serverId}`;
    await source.pipeline.accept(
      signEnvelope({
        domain: 'jb:post:create:v1',
        scope: community,
        nonce: new Uint8Array(16).fill(2),
        body: PostCreate.encode(
          PostCreate.fromPartial({ title: 'Survives replay', kind: 1 }),
        ).finish(),
        ...gates,
        nullifier: new Uint8Array(16).fill(2),
      }),
    );

    const target = new InMemoryProjectionStore();
    const registry = new DomainRegistry();
    for (const handler of forumHandlers(target, source.nodeSigner)) registry.register(handler);

    const report = await new ProjectionRebuilder(source.envelopes, target, registry).rebuild();
    expect(report).toMatchObject({ scanned: 2, projected: 2 });
    expect(target.snapshot()).toBe(source.projections.snapshot());
  });
});
