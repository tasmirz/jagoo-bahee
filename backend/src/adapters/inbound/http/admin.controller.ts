import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpException,
  Inject,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { identityId } from '@jagoo/sdk/core';
import { serverVouchSigningBytes } from '@jagoo/sdk';
import { FederationInbox } from '../../../core/app/federation-inbox.js';
import { TRUST_LEVEL_WIRE } from '../../../core/domain/federation/trust.js';
import { PeerDirectory, PeerTrust } from '../../../core/ports/network.port.js';
import { NodeSigner } from '../../../core/ports/node-signer.port.js';
import { Clock } from '../../../core/ports/system.port.js';
import { SessionAuth } from '../../../core/ports/auth.port.js';
import { Observability } from '../../../core/ports/observability.port.js';
import { RequestSecurity, type IpBlock } from '../../../core/ports/request-security.port.js';
import { ProjectionStore } from '../../../core/ports/storage.port.js';
import { WitnessLog } from '../../../core/ports/transparency.port.js';
import {
  OperatorConfig,
  type SecurityConfig,
} from '../../../core/ports/operator-config.port.js';

function configuredAdminKeys(): Set<string> {
  return new Set(
    (process.env.ADMIN_KEYS ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Levels an operator may assert about a peer.
 *
 * `UNSPECIFIED` is absent because a vouch that says nothing is not an opinion, and
 * `PROBATION` because it is the TOFU default every peer already has — asserting it would
 * be a no-op that still consumed a directory row and a gossip slot.
 */
const VOUCHABLE_LEVELS = [PeerTrust.BLOCKED, PeerTrust.NORMAL, PeerTrust.TRUSTED] as const;

function validSubject(value: string): boolean {
  return (
    /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value) ||
    /^[0-9a-f:]+$/i.test(value) ||
    /^(?:\d{1,3}\.){3}\d{1,3}\/(?:[0-9]|[12][0-9]|3[0-2])$/.test(value) ||
    /^[0-9a-f:]+\/(?:[0-9]|[1-9][0-9]|1[01][0-9]|12[0-8])$/i.test(value)
  );
}

@Controller('v1/admin')
export class AdminController {
  constructor(
    @Inject(SessionAuth) private readonly auth: SessionAuth,
    @Inject(RequestSecurity) private readonly security: RequestSecurity,
    @Inject(ProjectionStore) private readonly projections: ProjectionStore,
    @Inject(WitnessLog) private readonly witness: WitnessLog,
    @Inject(Observability) private readonly metrics: Observability,
    @Inject(OperatorConfig) private readonly config: OperatorConfig,
    @Inject(PeerDirectory) private readonly peers: PeerDirectory,
    @Inject(FederationInbox) private readonly inbox: FederationInbox,
    @Inject(NodeSigner) private readonly signer: NodeSigner,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  private async authorize(authorization?: string): Promise<void> {
    const [scheme, token] = authorization?.split(' ') ?? [];
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new HttpException({ detail: 'administrator access token is required' }, 401);
    }
    let key: Uint8Array;
    try {
      const principal = await this.auth.verifyAccess(token);
      key = principal.key;
    } catch {
      throw new HttpException({ detail: 'administrator access token is invalid' }, 401);
    }
    const admins = configuredAdminKeys();
    if (
      !admins.has(Buffer.from(key).toString('hex').toLowerCase()) &&
      !admins.has(identityId(key).toLowerCase())
    ) {
      throw new HttpException({ detail: 'administrator role is required' }, 403);
    }
  }

  @Get('summary')
  async summary(@Headers('authorization') authorization?: string): Promise<Record<string, unknown>> {
    await this.authorize(authorization);
    const count = async (collection: string) =>
      (await this.projections.collection<Record<string, unknown>>(collection).find({}, 100_000))
        .length;
    const sth = await this.witness.currentSth();
    const [identities, communities, posts, reports, blocks] = await Promise.all([
      count('forum_profiles'),
      count('forum_communities'),
      count('forum_posts'),
      count('forum_reports'),
      this.security.blocks(),
    ]);
    return {
      identities,
      communities,
      posts,
      reports,
      ipBlocks: blocks.length,
      transparency: { treeSize: sth.treeSize, timestampMs: sth.timestampMs },
    };
  }

  @Get('config/security')
  async securityConfig(
    @Headers('authorization') authorization?: string,
  ): Promise<SecurityConfig> {
    await this.authorize(authorization);
    return this.config.security();
  }

  @Put('config/security')
  async updateSecurityConfig(
    @Body()
    body: {
      readonly registrations_open?: boolean;
      readonly request_limit_per_minute?: number;
    },
    @Headers('authorization') authorization?: string,
  ): Promise<SecurityConfig> {
    await this.authorize(authorization);
    const requestLimit = Number(body?.request_limit_per_minute);
    if (
      typeof body?.registrations_open !== 'boolean' ||
      !Number.isSafeInteger(requestLimit) ||
      requestLimit < 10 ||
      requestLimit > 100_000
    ) {
      throw new HttpException(
        {
          detail:
            'registrations_open must be boolean and request_limit_per_minute must be 10-100000',
        },
        400,
      );
    }
    const value = {
      registrationsOpen: body.registrations_open,
      requestLimitPerMinute: requestLimit,
    };
    await this.security.setLimitPerMinute(value.requestLimitPerMinute);
    return this.config.updateSecurity(value);
  }

  @Get('features')
  async features(
    @Headers('authorization') authorization?: string,
  ): Promise<Record<string, unknown>> {
    await this.authorize(authorization);
    return {
      planes: ['FORUM'],
      adapters: {
        database: process.env.MONGO_URL ? 'mongo' : 'in-memory',
        cache: process.env.REDIS_URL ? 'redis' : 'in-memory',
        blobs: process.env.BLOB_FILESYSTEM_ROOT
          ? 'filesystem'
          : process.env.S3_ENDPOINT
            ? 's3'
            : 'in-memory',
        witness: process.env.MONGO_URL ? 'mongo-merkle' : 'local-merkle',
        labeller: 'null',
      },
    };
  }

  @Get('metrics')
  async getMetrics(@Headers('authorization') authorization?: string) {
    await this.authorize(authorization);
    return this.metrics.snapshot();
  }

  @Get('ip-blocks')
  async blocks(
    @Headers('authorization') authorization?: string,
  ): Promise<{ readonly items: readonly IpBlock[] }> {
    await this.authorize(authorization);
    return { items: await this.security.blocks() };
  }

  @Post('ip-blocks')
  async block(
    @Body()
    body: {
      readonly subject?: string;
      readonly reason?: string;
      readonly expires_at_ms?: number | null;
    },
    @Headers('authorization') authorization?: string,
  ): Promise<IpBlock> {
    await this.authorize(authorization);
    const subject = body?.subject?.trim();
    const reason = body?.reason?.trim();
    const expiresAtMs = body?.expires_at_ms ?? null;
    if (!subject || !validSubject(subject)) {
      throw new HttpException({ detail: 'subject must be an IP address or CIDR' }, 400);
    }
    if (!reason || reason.length > 240) {
      throw new HttpException({ detail: 'reason must contain 1-240 characters' }, 400);
    }
    if (
      expiresAtMs !== null &&
      (!Number.isSafeInteger(expiresAtMs) || expiresAtMs <= Date.now())
    ) {
      throw new HttpException({ detail: 'expires_at_ms must be a future timestamp or null' }, 400);
    }
    const value = { subject, reason, createdAtMs: Date.now(), expiresAtMs };
    await this.security.block(value);
    return value;
  }

  @Delete('ip-blocks/:subject')
  async unblock(
    @Param('subject') subject: string,
    @Headers('authorization') authorization?: string,
  ): Promise<{ readonly deleted: true }> {
    await this.authorize(authorization);
    await this.security.unblock(subject);
    return { deleted: true };
  }

  /**
   * ADM-11 / FD-05 — assert a vouch about a peer.
   *
   * This is the only way a vouch enters the system, and it is deliberately an operator
   * action: a vouch is a statement that a human checked something out of band, so nothing
   * automatic should be able to manufacture one. The node signs it with its own key, which
   * is what makes it verifiable and non-repudiable once gossiped in a handshake.
   *
   * `recordVouch` re-derives the peer's trust level immediately (`Plans/05` §3), so the
   * response shows the effect rather than making the operator go and look.
   */
  @Post('federation/vouches')
  async vouch(
    @Body()
    body: {
      readonly peer_id?: string;
      readonly level?: string;
      readonly note?: string;
    },
    @Headers('authorization') authorization?: string,
  ): Promise<Record<string, unknown>> {
    await this.authorize(authorization);

    const peerId = body?.peer_id?.trim();
    if (!peerId) throw new HttpException({ detail: 'peer_id is required' }, 400);

    const level = VOUCHABLE_LEVELS.find((candidate) => candidate === body?.level);
    if (!level) {
      throw new HttpException(
        { detail: `level must be one of ${VOUCHABLE_LEVELS.join(', ')}` },
        400,
      );
    }

    const note = (body?.note ?? '').slice(0, 240);
    const peer = await this.peers.get(peerId);
    if (!peer) throw new HttpException({ detail: 'peer is not known here' }, 404);

    const assertedAtMs = this.clock.nowMs();
    const signature = this.signer.sign(
      serverVouchSigningBytes({
        peerKey: peer.publicKey,
        level: TRUST_LEVEL_WIRE[level],
        note,
        assertedAtMs: BigInt(assertedAtMs),
      }),
    );

    const updated = await this.inbox.recordVouch({
      asserterKey: this.signer.publicKey,
      peerKey: peer.publicKey,
      level,
      note,
      assertedAtMs,
      signature,
    });
    if (!updated) throw new HttpException({ detail: 'vouch was refused' }, 409);

    return { peerId, level, note, assertedAtMs, resultingTrust: updated.trust };
  }
}
