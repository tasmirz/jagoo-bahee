import { Controller, Get, Headers, HttpException, Inject, Param, Query } from '@nestjs/common';
import { identityId } from '@jagoo/sdk/core';
import { parseEnvelope } from '../../../core/domain/pipeline/parse.js';
import { SessionAuth } from '../../../core/ports/auth.port.js';
import { EnvelopeReader, ProjectionStore } from '../../../core/ports/storage.port.js';
import {
  SIGNAL_CHANNELS_COLLECTION,
  SIGNAL_CHANNEL_VOUCHES_COLLECTION,
  type SignalChannelDoc,
  type SignalChannelVouchDoc,
} from '../../../features/signal/channel/channel.handlers.js';
import {
  SIGNAL_BROADCASTS_COLLECTION,
  channelVerificationLevel,
  type SignalBroadcastDoc,
} from '../../../features/signal/broadcast/broadcast.handlers.js';
import {
  SIGNAL_CHECKINS_COLLECTION,
  SIGNAL_LATEST_CHECKINS_COLLECTION,
  SIGNAL_MISSING_COLLECTION,
  SIGNAL_RESOURCES_COLLECTION,
  type SignalCheckInDoc,
  type SignalMissingPersonDoc,
  type SignalResourceDoc,
} from '../../../features/signal/crisis/crisis.handlers.js';
import {
  SIGNAL_GROUPS_COLLECTION,
  SIGNAL_MESSAGES_COLLECTION,
  SIGNAL_PREKEYS_COLLECTION,
  SIGNAL_SESSIONS_COLLECTION,
  type SignalGroupDoc,
  type SignalMessageDoc,
  type SignalPrekeyDoc,
  type SignalSessionDoc,
} from '../../../features/signal/message/signal-message.handlers.js';

const MAX_SCAN = 100_000;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function bearer(header: string | undefined): string {
  const [scheme, value] = header?.split(' ') ?? [];
  if (scheme?.toLowerCase() !== 'bearer' || !value) {
    throw new HttpException({ detail: 'access token is required' }, 401);
  }
  return value;
}

const timeOf = (value: unknown): number => {
  const row = value as Record<string, unknown>;
  return Number(
    row['createdAtMs'] ??
      row['updatedAtMs'] ??
      row['reportedAtMs'] ??
      row['declaredAtMs'] ??
      0,
  );
};
const idOf = (value: unknown): string =>
  String((value as { id?: string; contentId?: string }).id ?? '');

function paginate<T>(
  rows: readonly T[],
  requestedLimit?: string,
  cursor?: string,
): { readonly items: readonly T[]; readonly nextCursor: string | null } {
  const limit = Math.min(Math.max(Number(requestedLimit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const ordered = [...rows].sort(
    (left, right) => timeOf(right) - timeOf(left) || idOf(right).localeCompare(idOf(left)),
  );
  let start = 0;
  if (cursor) {
    try {
      const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
      start = Math.max(0, ordered.findIndex((row) => idOf(row) === decoded) + 1);
    } catch {
      throw new HttpException({ detail: 'cursor is invalid' }, 400);
    }
  }
  const items = ordered.slice(start, start + limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      start + limit < ordered.length && last
        ? Buffer.from(idOf(last)).toString('base64url')
        : null,
  };
}

@Controller('v1/signal')
export class SignalReadController {
  constructor(
    @Inject(ProjectionStore) private readonly projections: ProjectionStore,
    @Inject(EnvelopeReader) private readonly envelopes: EnvelopeReader,
    @Inject(SessionAuth) private readonly auth: SessionAuth,
  ) {}

  private async actor(authorization?: string): Promise<string> {
    try {
      const principal = await this.auth.verifyAccess(bearer(authorization));
      return Buffer.from(principal.key).toString('hex');
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ detail: 'access token is invalid' }, 401);
    }
  }

  private async provenance(contentId: string): Promise<Record<string, unknown> | null> {
    const stored = await this.envelopes.get(contentId);
    if (!stored) return null;
    const { canonical } = parseEnvelope(stored.raw);
    return {
      contentId,
      plane: 'SIGNAL',
      authorKey: identityId(stored.envelope.authorKey),
      keyAlg: 'ED25519',
      signature: Buffer.from(stored.envelope.signature).toString('base64'),
      canonicalBytes: Buffer.from(canonical).toString('base64'),
      receipt: stored.receipt
        ? {
            logIndex: stored.receipt.logIndex,
            leafIndex: stored.receipt.leafIndex,
            acceptedAtMs: stored.receipt.acceptedAtMs,
            serverId: stored.receipt.serverId,
            serverKey: Buffer.from(stored.receipt.serverKey).toString('base64'),
            serverSignature: Buffer.from(stored.receipt.signature).toString('base64'),
            sth: {
              treeSize: stored.receipt.sth.treeSize,
              serverKey: Buffer.from(stored.receipt.sth.serverKey).toString('base64'),
              rootHash: Buffer.from(stored.receipt.sth.rootHash).toString('base64'),
              timestampMs: stored.receipt.sth.timestampMs,
              signature: Buffer.from(stored.receipt.sth.signature).toString('base64'),
            },
            inclusionProof: stored.receipt.inclusionProof.map((hash) =>
              Buffer.from(hash).toString('base64'),
            ),
          }
        : null,
    };
  }

  @Get('channels')
  async channels(
    @Query('q') query?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<Record<string, unknown>> {
    const rows = await this.projections
      .collection<SignalChannelDoc>(SIGNAL_CHANNELS_COLLECTION)
      .find({}, MAX_SCAN);
    const needle = query?.trim().toLocaleLowerCase();
    const page = paginate(
      needle
        ? rows.filter((channel) =>
            `${channel.name}\n${channel.description}`.toLocaleLowerCase().includes(needle),
          )
        : rows,
      limit,
      cursor,
    );
    return {
      items: await Promise.all(
        page.items.map(async (channel) => ({
          ...channel,
          verification: await channelVerificationLevel(this.projections, channel.id),
        })),
      ),
      nextCursor: page.nextCursor,
    };
  }

  @Get('channels/:channel')
  async channel(@Param('channel') channelId: string): Promise<Record<string, unknown>> {
    const channel = await this.projections
      .collection<SignalChannelDoc>(SIGNAL_CHANNELS_COLLECTION)
      .findOne({ id: channelId });
    if (!channel) throw new HttpException({ detail: 'channel not found' }, 404);
    const vouches = await this.projections
      .collection<SignalChannelVouchDoc>(SIGNAL_CHANNEL_VOUCHES_COLLECTION)
      .find({ channel: channelId }, MAX_SCAN);
    return {
      ...channel,
      verification: await channelVerificationLevel(this.projections, channelId),
      vouches,
    };
  }

  @Get('broadcasts')
  async broadcasts(
    @Query('channel') channel?: string,
    @Query('after_sequence') afterSequence?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<Record<string, unknown>> {
    let rows = await this.projections
      .collection<SignalBroadcastDoc>(SIGNAL_BROADCASTS_COLLECTION)
      .find({}, MAX_SCAN);
    if (channel) rows = rows.filter((row) => row.channel === channel);
    if (afterSequence && /^\d+$/.test(afterSequence)) {
      rows = rows.filter((row) => BigInt(row.sequence) > BigInt(afterSequence));
    }
    const page = paginate(rows, limit, cursor);
    return {
      items: await Promise.all(
        page.items.map(async (broadcast) => ({
          ...broadcast,
          verification: await channelVerificationLevel(this.projections, broadcast.channel),
          gap:
            BigInt(broadcast.sequence) > BigInt(broadcast.previousSequence) + 1n
              ? {
                  from: (BigInt(broadcast.previousSequence) + 1n).toString(),
                  to: (BigInt(broadcast.sequence) - 1n).toString(),
                }
              : null,
          provenance: await this.provenance(broadcast.id),
        })),
      ),
      nextCursor: page.nextCursor,
    };
  }

  @Get('checkins')
  async checkins(
    @Query('latest') latest = 'true',
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<Record<string, unknown>> {
    const collection =
      latest === 'false' ? SIGNAL_CHECKINS_COLLECTION : SIGNAL_LATEST_CHECKINS_COLLECTION;
    const rows = await this.projections
      .collection<SignalCheckInDoc>(collection)
      .find({}, MAX_SCAN);
    const page = paginate(rows, limit, cursor);
    return {
      // Trusted-contact keys are delivery metadata and never part of the public read model.
      items: page.items.map(({ notifyKeys: _notifyKeys, ...row }) => row),
      nextCursor: page.nextCursor,
    };
  }

  @Get('missing')
  async missing(
    @Query('q') query?: string,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<Record<string, unknown>> {
    let rows = await this.projections
      .collection<SignalMissingPersonDoc>(SIGNAL_MISSING_COLLECTION)
      .find({}, MAX_SCAN);
    const needle = query?.trim().toLocaleLowerCase();
    if (needle) {
      rows = rows.filter((row) =>
        `${row.name}\n${row.description}\n${row.lastSeenPlace}`
          .toLocaleLowerCase()
          .includes(needle),
      );
    }
    if (status && Number.isInteger(Number(status))) {
      rows = rows.filter((row) => row.status === Number(status));
    }
    const page = paginate(rows, limit, cursor);
    return { items: page.items, nextCursor: page.nextCursor };
  }

  @Get('resources')
  async resources(
    @Query('kind') kind?: string,
    @Query('state') state?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<Record<string, unknown>> {
    let rows = await this.projections
      .collection<SignalResourceDoc>(SIGNAL_RESOURCES_COLLECTION)
      .find({}, MAX_SCAN);
    if (kind && Number.isInteger(Number(kind))) rows = rows.filter((row) => row.kind === Number(kind));
    if (state && Number.isInteger(Number(state))) {
      rows = rows.filter((row) => row.state === Number(state));
    }
    const page = paginate(rows, limit, cursor);
    return { items: page.items, nextCursor: page.nextCursor };
  }

  @Get('prekeys/:key')
  async prekey(@Param('key') key: string): Promise<SignalPrekeyDoc> {
    const id = key.startsWith('jbk1') ? key.slice(4) : key;
    const rows = await this.projections
      .collection<SignalPrekeyDoc>(SIGNAL_PREKEYS_COLLECTION)
      .find({}, MAX_SCAN);
    const row = rows.find(
      (candidate) =>
        candidate.id === id || identityId(Buffer.from(candidate.id, 'hex')) === key,
    );
    if (!row || row.validUntilMs <= Date.now()) {
      throw new HttpException({ detail: 'valid prekey bundle not found' }, 404);
    }
    return row;
  }

  @Get('me/messages')
  async messages(
    @Headers('authorization') authorization?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<Record<string, unknown>> {
    const actor = await this.actor(authorization);
    const rows = await this.projections
      .collection<SignalMessageDoc>(SIGNAL_MESSAGES_COLLECTION)
      .find({}, MAX_SCAN);
    const page = paginate(
      rows.filter((row) => row.senderKey === actor || row.recipientKey === actor),
      limit,
      cursor,
    );
    return { items: page.items, nextCursor: page.nextCursor };
  }

  @Get('me/sessions')
  async sessions(
    @Headers('authorization') authorization?: string,
  ): Promise<{ readonly items: readonly SignalSessionDoc[] }> {
    const actor = await this.actor(authorization);
    const rows = await this.projections
      .collection<SignalSessionDoc>(SIGNAL_SESSIONS_COLLECTION)
      .find({}, MAX_SCAN);
    return { items: rows.filter((row) => row.senderKey === actor || row.recipientKey === actor) };
  }

  @Get('me/groups')
  async groups(
    @Headers('authorization') authorization?: string,
  ): Promise<{ readonly items: readonly SignalGroupDoc[] }> {
    const actor = await this.actor(authorization);
    const rows = await this.projections
      .collection<SignalGroupDoc>(SIGNAL_GROUPS_COLLECTION)
      .find({}, MAX_SCAN);
    return {
      items: rows.filter((row) => row.adminKey === actor || row.memberKeys.includes(actor)),
    };
  }
}
