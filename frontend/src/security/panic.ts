import { clearForumLocalData } from '../data';
import { SecureForumSigner } from '../signer';

/** AUTH-22: wipe Forum keys and Forum cache without touching a future Signal vault. */
export async function panicForum(signer?: SecureForumSigner): Promise<void> {
  if (signer) await signer.panic();
  else await SecureForumSigner.panicConfiguredVault();
  await clearForumLocalData();
}
