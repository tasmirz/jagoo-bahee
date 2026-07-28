import { clearForumLocalData } from '../data';
import type { SecureForumSigner } from '../signer';

/** AUTH-22: wipe Forum keys and Forum cache without touching a future Signal vault. */
export async function panicForum(signer: SecureForumSigner): Promise<void> {
  await signer.panic();
  await clearForumLocalData();
}
