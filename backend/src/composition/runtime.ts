import type { Db, MongoClient } from 'mongodb';

export const MONGO_RUNTIME = Symbol('MongoRuntime');
export const REDIS_RUNTIME = Symbol('RedisRuntime');
export const S3_RUNTIME = Symbol('S3Runtime');

export interface MongoRuntime {
  readonly client: MongoClient;
  readonly db: Db;
}
