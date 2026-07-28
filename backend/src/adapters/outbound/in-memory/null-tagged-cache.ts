import { TaggedCache } from '../../../core/ports/cache.port.js';

/** Keeps cache optional without making readers branch on infrastructure. */
export class NullTaggedCache extends TaggedCache {
  async get<T>(_key: string): Promise<T | null> {
    return null;
  }
  async put(
    _key: string,
    _value: unknown,
    _tags: readonly string[],
    _ttlMs: number,
  ): Promise<void> {}
  async invalidate(_tag: string): Promise<number> {
    return 0;
  }
}
