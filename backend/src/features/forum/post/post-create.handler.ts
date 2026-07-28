/**
 * T1.18 — `jb:post:create:v1`.
 *
 * The reference `DomainHandler`. Adding this feature required a registry row and this file
 * and touched no core code — which is exactly what P1-G11 asserts.
 *
 * The four methods are separated by when they may touch the world:
 *   decode      bytes → typed body
 *   validate    PURE. No I/O, no clock, no random. Unit-testable with nothing wired up.
 *   authorize   reads projections, writes nothing
 *   project     writes, inside the transaction shared with the witness append
 */

import { PostCreate } from '@jagoo/sdk/proto';
import type { Tx } from '../../../core/domain/domain-handler.js';
import { allowed, invalid, valid, type AuthDecision, type DomainHandler, type ValidationResult } from '../../../core/domain/domain-handler.js';
import { Plane, type ParsedEnvelope } from '../../../core/domain/envelope.js';
import type { ProjectionStore } from '../../../core/ports/storage.port.js';
import { POSTS_COLLECTION, type PostDoc } from './post.projection.js';

/** PST-02. Counted in CODE POINTS, not UTF-8 bytes — see the note in `validate`. */
export const MAX_TITLE_CHARS = 300;
export const MAX_BODY_CHARS = 40000;

export class PostCreateHandler implements DomainHandler<PostCreate> {
  readonly domain = 'jb:post:create:v1';
  readonly plane = Plane.FORUM;

  constructor(private readonly projections: ProjectionStore) {}

  decode(body: Uint8Array): PostCreate {
    return PostCreate.decode(body);
  }

  validate(body: PostCreate, env: ParsedEnvelope): ValidationResult {
    if (!env.scope) {
      return invalid('a post must name the community it belongs to', 'scope');
    }

    const title = body.title.trim();
    if (title.length === 0) return invalid('title is required', 'title');

    // Counted with the spread operator so it counts CODE POINTS, not UTF-16 units. Bangla
    // is the primary language here; `"পানি".length` over-counts nothing but emoji and
    // surrogate pairs would, and a limit that silently differs per script is a limit that
    // rejects legitimate Bangla while accepting the same-length English.
    const titleChars = [...title].length;
    if (titleChars > MAX_TITLE_CHARS) {
      return invalid(`title exceeds ${MAX_TITLE_CHARS} characters`, 'title');
    }

    if ([...body.body_markdown].length > MAX_BODY_CHARS) {
      return invalid(`body exceeds ${MAX_BODY_CHARS} characters`, 'body_markdown');
    }

    // ID-01: an attachment reference is a content ID, never a row ID — a row ID is
    // meaningless on any other instance and is what made v1 federation impossible.
    for (const attachment of body.attachments) {
      if (!attachment.startsWith('jb1')) {
        return invalid('attachment references must be content IDs', 'attachments');
      }
    }

    if (body.crosspost_of && !body.crosspost_of.startsWith('jb1')) {
      return invalid('crosspost_of must be a content ID', 'crosspost_of');
    }

    return valid;
  }

  async authorize(_body: PostCreate, _env: ParsedEnvelope): Promise<AuthDecision> {
    // Publish-then-attest: content is valid the instant its author signs it. There is no
    // server-side approval step, because withheld approval is indistinguishable from a
    // network error — which makes silent censorship structurally possible. Membership and
    // ban checks land here in T1.22/T1.23 as *explicit* signed state, not as an implicit
    // gate.
    return allowed;
  }

  async project(body: PostCreate, env: ParsedEnvelope, tx: Tx): Promise<void> {
    const doc: PostDoc = {
      contentId: env.contentId,
      authorKey: Buffer.from(env.authorKey).toString('hex'),
      community: env.scope,
      title: body.title.trim(),
      kind: body.kind,
      bodyMarkdown: body.body_markdown,
      url: body.url,
      attachments: [...body.attachments],
      flair: body.flair,
      createdAtMs: Number(env.createdAtMs),
      editedAtMs: null,
      removed: false,
      removedReason: null,
      score: 0,
      commentCount: 0,
    };
    await this.projections.collection<PostDoc>(POSTS_COLLECTION).put(env.contentId, doc, tx);
  }
}
