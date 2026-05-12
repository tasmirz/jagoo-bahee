/**
 * Permission Helper Utilities
 *
 * Provides type-safe permission checking and bitmap manipulation
 * for the two-tier permission system
 */

/**
 * Member status flags (SubredditMember.statusFlags)
 * Only for restrictive states - all other permissions via Role/UserRole
 */
export enum MemberStatus {
  BANNED = 1 << 0, // 1 - User is banned
  MUTED = 1 << 1 // 2 - User is muted
  // All other permissions (moderator, creator, etc.) handled by Role/UserRole system
}

/**
 * Role permission flags (Role.permissions)
 */
export enum RolePermission {
  // Content Management (0-9)
  POSTS_VIEW = 1 << 0,
  POSTS_CREATE = 1 << 1,
  POSTS_EDIT_OWN = 1 << 2,
  POSTS_EDIT_ALL = 1 << 3,
  POSTS_DELETE_OWN = 1 << 4,
  POSTS_DELETE_ALL = 1 << 5,
  POSTS_PIN = 1 << 6,
  POSTS_LOCK = 1 << 7,
  POSTS_APPROVE = 1 << 8,
  POSTS_REMOVE = 1 << 9,

  // Comments (10-14)
  COMMENTS_VIEW = 1 << 10,
  COMMENTS_CREATE = 1 << 11,
  COMMENTS_EDIT_OWN = 1 << 12,
  COMMENTS_EDIT_ALL = 1 << 13,
  COMMENTS_DELETE_ALL = 1 << 14,

  // Moderation (15-19)
  MOD_VIEW_REPORTS = 1 << 15,
  MOD_HANDLE_REPORTS = 1 << 16,
  MOD_VIEW_LOGS = 1 << 17,
  MOD_BAN_USERS = 1 << 18,
  MOD_MUTE_USERS = 1 << 19,

  // Members (20-22)
  MEMBERS_VIEW = 1 << 20,
  MEMBERS_KICK = 1 << 21,
  MEMBERS_INVITE = 1 << 22,

  // Settings (23-27)
  SETTINGS_VIEW = 1 << 23,
  SETTINGS_EDIT = 1 << 24,
  SETTINGS_ROLES = 1 << 25,
  SETTINGS_MODERATORS = 1 << 26,
  SETTINGS_DELETE = 1 << 27,

  // Special (28)
  ALL_PERMISSIONS = 1 << 28
}

/**
 * Permission string mappings for role-based permissions
 */
export const PERMISSION_MAP: Record<string, number> = {
  // Content
  'posts.view': RolePermission.POSTS_VIEW,
  'posts.create': RolePermission.POSTS_CREATE,
  'posts.edit.own': RolePermission.POSTS_EDIT_OWN,
  'posts.edit.all': RolePermission.POSTS_EDIT_ALL,
  'posts.delete.own': RolePermission.POSTS_DELETE_OWN,
  'posts.delete.all': RolePermission.POSTS_DELETE_ALL,
  'posts.pin': RolePermission.POSTS_PIN,
  'posts.lock': RolePermission.POSTS_LOCK,
  'posts.approve': RolePermission.POSTS_APPROVE,
  'posts.remove': RolePermission.POSTS_REMOVE,

  // Comments
  'comments.view': RolePermission.COMMENTS_VIEW,
  'comments.create': RolePermission.COMMENTS_CREATE,
  'comments.edit.own': RolePermission.COMMENTS_EDIT_OWN,
  'comments.edit.all': RolePermission.COMMENTS_EDIT_ALL,
  'comments.delete.all': RolePermission.COMMENTS_DELETE_ALL,

  // Moderation
  'mod.view.reports': RolePermission.MOD_VIEW_REPORTS,
  'mod.handle.reports': RolePermission.MOD_HANDLE_REPORTS,
  'mod.view.logs': RolePermission.MOD_VIEW_LOGS,
  'mod.ban.users': RolePermission.MOD_BAN_USERS,
  'mod.mute.users': RolePermission.MOD_MUTE_USERS,

  // Members
  'members.view': RolePermission.MEMBERS_VIEW,
  'members.kick': RolePermission.MEMBERS_KICK,
  'members.invite': RolePermission.MEMBERS_INVITE,

  // Settings
  'settings.view': RolePermission.SETTINGS_VIEW,
  'settings.edit': RolePermission.SETTINGS_EDIT,
  'settings.roles': RolePermission.SETTINGS_ROLES,
  'settings.moderators': RolePermission.SETTINGS_MODERATORS,
  'settings.delete': RolePermission.SETTINGS_DELETE,

  // Aliases
  'subreddit.delete': RolePermission.SETTINGS_DELETE,
  all: RolePermission.ALL_PERMISSIONS
}

/**
 * Creator-only permissions that moderators cannot perform
 */
export const CREATOR_ONLY_PERMISSIONS = ['subreddit.delete', 'subreddit.transfer', 'settings.delete']

/**
 * Helper class for permission checking
 */
export class PermissionHelper {
  /**
   * Check if a status flag is set
   */
  static hasStatusFlag(statusFlags: bigint | number, flag: MemberStatus): boolean {
    const flags = BigInt(statusFlags)
    const flagBit = BigInt(flag)
    return (flags & flagBit) !== BigInt(0)
  }

  /**
   * Check if banned
   */
  static isBanned(statusFlags: bigint | number): boolean {
    return this.hasStatusFlag(statusFlags, MemberStatus.BANNED)
  }

  /**
   * Check if muted
   */
  static isMuted(statusFlags: bigint | number): boolean {
    return this.hasStatusFlag(statusFlags, MemberStatus.MUTED)
  }

  /**
   * @deprecated - Moderator status is now managed via Role/UserRole system
   */
  static isModerator(statusFlags: bigint | number): boolean {
    return false
  }

  /**
   * @deprecated - Creator status is determined by subreddit.createdBy field
   */
  static isCreatorFlag(statusFlags: bigint | number): boolean {
    return false
  }

  /**
   * @deprecated - Contributor status is now managed via Role/UserRole system
   */
  static isContributor(statusFlags: bigint | number): boolean {
    return false
  }

  /**
   * Add a status flag
   */
  static addStatusFlag(statusFlags: bigint | number, flag: MemberStatus): bigint {
    const flags = BigInt(statusFlags)
    const flagBit = BigInt(flag)
    return flags | flagBit
  }

  /**
   * Remove a status flag
   */
  static removeStatusFlag(statusFlags: bigint | number, flag: MemberStatus): bigint {
    const flags = BigInt(statusFlags)
    const flagBit = BigInt(flag)
    return flags & ~flagBit
  }

  /**
   * Check if a role has a specific permission
   */
  static hasRolePermission(rolePermissions: bigint | number, permission: RolePermission | string): boolean {
    const perms = BigInt(rolePermissions)

    // If permission is a string, map it to a bit value
    const permBit = typeof permission === 'string' ? BigInt(PERMISSION_MAP[permission] || 0) : BigInt(permission)

    if (permBit === BigInt(0)) return false

    return (perms & permBit) !== BigInt(0)
  }

  /**
   * Add a permission to a role
   */
  static addRolePermission(rolePermissions: bigint | number, permission: RolePermission): bigint {
    const perms = BigInt(rolePermissions)
    const permBit = BigInt(permission)
    return perms | permBit
  }

  /**
   * Remove a permission from a role
   */
  static removeRolePermission(rolePermissions: bigint | number, permission: RolePermission): bigint {
    const perms = BigInt(rolePermissions)
    const permBit = BigInt(permission)
    return perms & ~permBit
  }

  /**
   * Get all active permissions from a bitmap
   */
  static getActivePermissions(rolePermissions: bigint | number): RolePermission[] {
    const perms = BigInt(rolePermissions)
    const active: RolePermission[] = []

    for (const [key, value] of Object.entries(RolePermission)) {
      if (typeof value === 'number') {
        const permBit = BigInt(value)
        if ((perms & permBit) !== BigInt(0)) {
          active.push(value as RolePermission)
        }
      }
    }

    return active
  }

  /**
   * Get all active status flags from a bitmap
   */
  static getActiveStatusFlags(statusFlags: bigint | number): MemberStatus[] {
    const flags = BigInt(statusFlags)
    const active: MemberStatus[] = []

    for (const [key, value] of Object.entries(MemberStatus)) {
      if (typeof value === 'number') {
        const flagBit = BigInt(value)
        if ((flags & flagBit) !== BigInt(0)) {
          active.push(value as MemberStatus)
        }
      }
    }

    return active
  }

  /**
   * Check if a permission is creator-only
   */
  static isCreatorOnlyPermission(permission: string): boolean {
    return CREATOR_ONLY_PERMISSIONS.includes(permission)
  }

  /**
   * Get default moderator permissions (all except creator-only)
   */
  static getModeratorPermissions(): bigint {
    let perms = BigInt(0)

    // Add all permissions except SETTINGS_DELETE
    for (const [key, value] of Object.entries(RolePermission)) {
      if (
        typeof value === 'number' &&
        value !== RolePermission.SETTINGS_DELETE &&
        value !== RolePermission.ALL_PERMISSIONS
      ) {
        perms = perms | BigInt(value)
      }
    }

    return perms
  }

  /**
   * @deprecated - Use Role/UserRole system instead. Creator is identified by subreddit.createdBy
   */
  static createCreatorFlags(): bigint {
    return BigInt(0)
  }

  /**
   * @deprecated - Use Role/UserRole system instead. Create a role with permissions and assign via UserRole
   */
  static createModeratorFlags(): bigint {
    return BigInt(0)
  }

  /**
   * Combine multiple role permissions (OR operation)
   */
  static combinePermissions(...permissions: (bigint | number)[]): bigint {
    return permissions.reduce<bigint>((acc, perm) => acc | BigInt(perm), BigInt(0))
  }

  /**
   * Convert statusFlags to human-readable string
   * Note: Only BANNED and MUTED are supported. Roles are managed via Role/UserRole system.
   */
  static statusFlagsToString(statusFlags: bigint | number): string {
    const active = this.getActiveStatusFlags(statusFlags)
    if (active.length === 0) return 'None'

    const names = active.map(flag => {
      switch (flag) {
        case MemberStatus.BANNED:
          return 'Banned'
        case MemberStatus.MUTED:
          return 'Muted'
        default:
          return 'Unknown'
      }
    })

    return names.join(', ')
  }

  /**
   * Convert role permissions to human-readable string
   */
  static rolePermissionsToString(rolePermissions: bigint | number): string {
    const active = this.getActivePermissions(rolePermissions)
    if (active.length === 0) return 'None'

    // Group by category
    const categories = {
      Posts: [] as string[],
      Comments: [] as string[],
      Moderation: [] as string[],
      Members: [] as string[],
      Settings: [] as string[],
      Special: [] as string[]
    }

    active.forEach(perm => {
      const name = Object.keys(RolePermission).find(key => RolePermission[key as keyof typeof RolePermission] === perm)

      if (!name) return

      if (name.startsWith('POSTS_')) {
        categories.Posts.push(name.replace('POSTS_', ''))
      } else if (name.startsWith('COMMENTS_')) {
        categories.Comments.push(name.replace('COMMENTS_', ''))
      } else if (name.startsWith('MOD_')) {
        categories.Moderation.push(name.replace('MOD_', ''))
      } else if (name.startsWith('MEMBERS_')) {
        categories.Members.push(name.replace('MEMBERS_', ''))
      } else if (name.startsWith('SETTINGS_')) {
        categories.Settings.push(name.replace('SETTINGS_', ''))
      } else {
        categories.Special.push(name)
      }
    })

    const parts: string[] = []
    for (const [category, perms] of Object.entries(categories)) {
      if (perms.length > 0) {
        parts.push(`${category}: ${perms.join(', ')}`)
      }
    }

    return parts.join(' | ')
  }
}

/**
 * Example usage:
 *
 * ```typescript
 * import { PermissionHelper, MemberStatus, RolePermission } from './permission.helper'
 *
 * // Check status flags (only BANNED and MUTED remain)
 * const statusFlags = BigInt(3) // BANNED + MUTED
 * const isBanned = PermissionHelper.isBanned(statusFlags) // true
 * const isMuted = PermissionHelper.isMuted(statusFlags) // true
 *
 * // Add/remove status flags
 * let flags = BigInt(0)
 * flags = PermissionHelper.addStatusFlag(flags, MemberStatus.BANNED) // 1
 * flags = PermissionHelper.addStatusFlag(flags, MemberStatus.MUTED) // 3
 * flags = PermissionHelper.removeStatusFlag(flags, MemberStatus.BANNED) // 2
 *
 * // Check role permissions
 * const rolePerms = BigInt(RolePermission.POSTS_DELETE_ALL | RolePermission.POSTS_EDIT_ALL)
 * const canDelete = PermissionHelper.hasRolePermission(rolePerms, RolePermission.POSTS_DELETE_ALL) // true
 * const canPin = PermissionHelper.hasRolePermission(rolePerms, 'posts.pin') // false
 *
 * // Note: Moderator/Creator permissions are now managed via Role/UserRole system
 * // Check subreddit.createdBy for creator status
 * // Check UserRole for moderator status
 *
 * // Get human-readable strings
 * console.log(PermissionHelper.statusFlagsToString(40)) // "Moderator, Creator"
 * console.log(PermissionHelper.rolePermissionsToString(rolePerms)) // "Posts: EDIT_ALL, DELETE_ALL"
 * ```
 */
