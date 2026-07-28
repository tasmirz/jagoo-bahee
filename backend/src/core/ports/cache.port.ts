export abstract class TaggedCache {
  abstract get<T>(key: string): Promise<T | null>;
  abstract put(key: string, value: unknown, tags: readonly string[], ttlMs: number): Promise<void>;
  /** Invalidation cost is proportional to entries carrying this tag, never keyspace size. */
  abstract invalidate(tag: string): Promise<number>;
}
