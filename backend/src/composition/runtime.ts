import type { Db, MongoClient } from 'mongodb';

export const MONGO_RUNTIME = Symbol('MongoRuntime');
export const REDIS_RUNTIME = Symbol('RedisRuntime');
export const S3_RUNTIME = Symbol('S3Runtime');
/** Same store, endpoint clients can reach. Presigning only — see the provider in app.module. */
export const S3_SIGNING_RUNTIME = Symbol('S3SigningRuntime');

export interface MongoRuntime {
  readonly client: MongoClient;
  readonly db: Db;
}
