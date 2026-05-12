export const COMMUNITY_ROLE_BITS = {
  member: BigInt(1) << BigInt(0),
  contributor: BigInt(1) << BigInt(1),
  moderator: BigInt(1) << BigInt(2),
  owner: BigInt(1) << BigInt(3)
}

export const COMMUNITY_PERMISSION_BITS = {
  communityRead: BigInt(1) << BigInt(0),
  postCreate: BigInt(1) << BigInt(1),
  communityUpdate: BigInt(1) << BigInt(2),
  memberBan: BigInt(1) << BigInt(3),
  memberUnban: BigInt(1) << BigInt(4),
  memberKick: BigInt(1) << BigInt(5),
  memberRoleUpdate: BigInt(1) << BigInt(6),
  postModerate: BigInt(1) << BigInt(7),
  commentModerate: BigInt(1) << BigInt(8),
  modlogRead: BigInt(1) << BigInt(9),
  reportReview: BigInt(1) << BigInt(10)
}

export const COMMUNITY_PERMISSION_NAMES: Record<string, string> = {
  communityRead: 'community.read',
  postCreate: 'post.create',
  communityUpdate: 'community.update',
  memberBan: 'member.ban',
  memberUnban: 'member.unban',
  memberKick: 'member.kick',
  memberRoleUpdate: 'member.role.update',
  postModerate: 'post.moderate',
  commentModerate: 'comment.moderate',
  modlogRead: 'modlog.read',
  reportReview: 'report.review'
}

export function permissionsForRoleMask(roleMask: bigint) {
  let mask = BigInt(0)
  if ((roleMask & COMMUNITY_ROLE_BITS.member) !== BigInt(0)) mask |= COMMUNITY_PERMISSION_BITS.communityRead
  if ((roleMask & COMMUNITY_ROLE_BITS.contributor) !== BigInt(0)) mask |= COMMUNITY_PERMISSION_BITS.postCreate
  if ((roleMask & COMMUNITY_ROLE_BITS.moderator) !== BigInt(0) || (roleMask & COMMUNITY_ROLE_BITS.owner) !== BigInt(0)) {
    mask |=
      COMMUNITY_PERMISSION_BITS.communityUpdate |
      COMMUNITY_PERMISSION_BITS.memberBan |
      COMMUNITY_PERMISSION_BITS.memberUnban |
      COMMUNITY_PERMISSION_BITS.memberKick |
      COMMUNITY_PERMISSION_BITS.memberRoleUpdate |
      COMMUNITY_PERMISSION_BITS.postModerate |
      COMMUNITY_PERMISSION_BITS.commentModerate |
      COMMUNITY_PERMISSION_BITS.modlogRead |
      COMMUNITY_PERMISSION_BITS.reportReview
  }
  return mask
}

export function permissionNames(mask: bigint) {
  return Object.entries(COMMUNITY_PERMISSION_BITS)
    .filter(([, bit]) => (mask & bit) !== BigInt(0))
    .map(([key]) => COMMUNITY_PERMISSION_NAMES[key])
    .sort()
}
