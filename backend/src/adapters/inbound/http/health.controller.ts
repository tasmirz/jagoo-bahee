import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import type Redis from 'ioredis';
import {
  MONGO_RUNTIME,
  REDIS_RUNTIME,
  type MongoRuntime,
} from '../../../composition/runtime.js';
import { WitnessLog } from '../../../core/ports/transparency.port.js';
import { BlobStore } from '../../../core/ports/content.port.js';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(MONGO_RUNTIME) private readonly mongo: MongoRuntime | null,
    @Inject(REDIS_RUNTIME) private readonly redis: Redis | null,
    @Inject(BlobStore) private readonly blobs: BlobStore,
    @Inject(WitnessLog) private readonly witness: WitnessLog,
  ) {}

  @Get('live')
  live(): Record<string, string> {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(): Promise<Record<string, unknown>> {
    const checks: Record<string, string> = {};
    try {
      if (this.mongo) await this.mongo.db.command({ ping: 1 });
      checks['database'] = this.mongo ? 'ok' : 'in-memory';
      if (this.redis) await this.redis.ping();
      checks['cache'] = this.redis ? 'ok' : 'in-memory';
      await this.blobs.ready();
      checks['blob'] = process.env.BLOB_FILESYSTEM_ROOT
        ? 'filesystem'
        : process.env.S3_ENDPOINT
          ? 's3'
          : 'in-memory';
      await this.witness.currentSth();
      checks['witness'] = 'ok';
      return { status: 'ready', checks };
    } catch {
      throw new ServiceUnavailableException({ status: 'not_ready', checks });
    }
  }
}
