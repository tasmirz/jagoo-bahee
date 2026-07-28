import { Binary, type ClientSession, type Db, MongoServerError } from 'mongodb';
import type { NonceStore } from '../../../core/app/ingress.js';
import type { Tx } from '../../../core/domain/domain-handler.js';

interface Context {
  readonly session: ClientSession;
}

interface NonceDocument {
  readonly _id: string;
  readonly author_key: Binary;
  readonly nonce: Binary;
  readonly expires_at: Date;
}

export class MongoNonceStore implements NonceStore {
  constructor(
    private readonly db: Db,
    private readonly ttlMs = 8 * 24 * 60 * 60 * 1000,
  ) {}

  private id(authorKey: Uint8Array, nonce: Uint8Array): string {
    return `${Buffer.from(authorKey).toString('hex')}:${Buffer.from(nonce).toString('hex')}`;
  }

  async ensureIndexes(): Promise<void> {
    await this.db
      .collection<NonceDocument>('ingress_nonces')
      .createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
  }

  async seen(authorKey: Uint8Array, nonce: Uint8Array): Promise<boolean> {
    if (nonce.length === 0) return false;
    return (await this.db.collection<NonceDocument>('ingress_nonces').countDocuments(
      { _id: this.id(authorKey, nonce) },
      { limit: 1 },
    )) > 0;
  }

  async reserve(authorKey: Uint8Array, nonce: Uint8Array, tx: Tx): Promise<boolean> {
    if (nonce.length === 0) return true;
    const session = (tx.context as Context | undefined)?.session;
    if (!session) throw new Error('Mongo nonce store requires a Mongo transaction');
    try {
      await this.db.collection<NonceDocument>('ingress_nonces').insertOne(
        {
          _id: this.id(authorKey, nonce),
          author_key: new Binary(Buffer.from(authorKey)),
          nonce: new Binary(Buffer.from(nonce)),
          expires_at: new Date(Date.now() + this.ttlMs),
        },
        { session },
      );
      return true;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) return false;
      throw error;
    }
  }
}
