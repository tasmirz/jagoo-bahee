export interface ActorContext {
  authId: string
  userId: string
  publicKey?: string
  globalFlags: bigint
  isGlobalModerator: boolean
  isGlobalAdmin: boolean
}

export function actorContextFromRequestUser(user: any): ActorContext {
  const authId = String(user?.id || user?._id || '')
  const globalFlags = BigInt(user?.abac ?? 0)
  return {
    authId,
    userId: authId,
    publicKey: user?.publicKey,
    globalFlags,
    isGlobalModerator: (globalFlags & (BigInt(1) << BigInt(4))) !== BigInt(0),
    isGlobalAdmin: (globalFlags & (BigInt(1) << BigInt(5))) !== BigInt(0)
  }
}
