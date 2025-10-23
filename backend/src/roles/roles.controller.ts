import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Req } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Role } from './schemas/role.schema'
import { UserRole } from './schemas/user-role.schema'
import { SubredditsService } from 'src/subreddits/subreddits.service'
import { SubredditPermissionsCacheService } from 'src/subreddits/subreddit-permissions-cache.service'
import { User } from 'src/users/schemas/user.schema'

@ApiTags('roles')
@Controller('roles')
export class RolesController {
  constructor(
    @InjectModel(Role.name) private roleModel: Model<Role>,
    @InjectModel(UserRole.name) private userRoleModel: Model<UserRole>,
    @InjectModel(User.name) private userModel: Model<User>,
    private subredditsService: SubredditsService,
    private permissionsCache: SubredditPermissionsCacheService
  ) {}

  // Get all roles for a subreddit
  @Get('subreddit/:subredditName')
  @UseGuards(JwtAuthGuard)
  async getRolesForSubreddit(@Param('subredditName') subredditName: string): Promise<any[]> {
    const subreddit = await this.subredditsService.findOne(subredditName)
    if (!subreddit) return []

    // Get all roles including system roles
    const roles = await this.roleModel.find({ subredditId: subreddit._id }).exec()

    // Add owner as a special role if not already present
    const hasOwnerRole = roles.some(r => r.name === 'Owner')
    if (!hasOwnerRole && subreddit.createdBy) {
      // Create a virtual owner role for display
      roles.unshift({
        _id: 'owner',
        name: 'Owner',
        subredditId: subreddit._id,
        permissions: '268435455', // All permissions as string (0xFFFFFFFF = 268435455)
        isSystemRole: true,
        createdAt: subreddit.createdAt,
        updatedAt: subreddit.updatedAt
      } as any)
    }

    // Convert BigInt permissions to strings for JSON serialization
    return roles.map(role => {
      const roleObj = role.toObject ? role.toObject() : role
      return {
        ...roleObj,
        permissions:
          typeof roleObj.permissions === 'bigint' ? roleObj.permissions.toString() : String(roleObj.permissions)
      }
    })
  }

  // Get moderators for a subreddit (users with roles)
  @Get('subreddit/:subredditName/moderators')
  @UseGuards(JwtAuthGuard)
  async getModeratorsForSubreddit(@Param('subredditName') subredditName: string) {
    const subreddit = await this.subredditsService.findOne(subredditName)
    if (!subreddit) return []

    // Get all user-role assignments for this subreddit
    const userRoles = await this.userRoleModel
      .find({ subredditId: subreddit._id })
      .populate('userId', 'username publicKey')
      .populate('roleId')
      .exec()

    // Add the owner
    const owner = await this.userModel.findById(subreddit.createdBy).select('username').exec()
    const moderators: any[] = []

    if (owner) {
      moderators.push({
        user: {
          _id: owner._id,
          username: owner.username
        },
        role: {
          _id: 'owner',
          name: 'Owner',
          isSystemRole: true
        },
        createdAt: subreddit.createdAt
      })
    }

    // Add other moderators
    for (const ur of userRoles) {
      if (ur.userId && ur.roleId) {
        moderators.push({
          user: ur.userId,
          role: ur.roleId,
          createdAt: ur.createdAt
        })
      }
    }

    return moderators
  }

  // Create a new role
  @Post()
  @UseGuards(JwtAuthGuard)
  async createRole(@Body() body: any, @Req() req: any) {
    const { name, subredditName, permissions } = body

    const subreddit = await this.subredditsService.findOne(subredditName)
    if (!subreddit) {
      throw new Error('Subreddit not found')
    }

    const role = await this.roleModel.create({
      name,
      subredditId: subreddit._id,
      permissions: BigInt(permissions || 0),
      isSystemRole: false
    })

    // Convert BigInt to string for JSON serialization
    const roleObj = role.toObject()
    return {
      ...roleObj,
      permissions: typeof roleObj.permissions === 'bigint' ? roleObj.permissions.toString() : roleObj.permissions
    }
  }

  // Update role permissions
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async updateRole(@Param('id') id: string, @Body() body: any) {
    const { permissions } = body

    const role = await this.roleModel.findByIdAndUpdate(id, { permissions: BigInt(permissions) }, { new: true }).exec()

    // Invalidate cache for all users in this subreddit since permissions changed
    if (role && role.subredditId) {
      await this.permissionsCache.invalidateSubreddit(String(role.subredditId))
    }

    // Convert BigInt to string for JSON serialization
    if (role) {
      const roleObj = role.toObject()
      return {
        ...roleObj,
        permissions: typeof roleObj.permissions === 'bigint' ? roleObj.permissions.toString() : roleObj.permissions
      }
    }

    return role
  }

  // Delete a role
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async deleteRole(@Param('id') id: string) {
    // Don't allow deleting system roles
    const role = await this.roleModel.findById(id).exec()
    if (role?.isSystemRole) {
      throw new Error('Cannot delete system roles')
    }

    // Remove all user assignments of this role
    await this.userRoleModel.deleteMany({ roleId: new Types.ObjectId(id) }).exec()

    // Delete the role
    await this.roleModel.findByIdAndDelete(id).exec()

    return { success: true }
  }

  // Assign role to user
  @Post(':roleId/assign/:userId')
  @UseGuards(JwtAuthGuard)
  async assignRole(@Param('roleId') roleId: string, @Param('userId') userId: string, @Req() req: any) {
    const role = await this.roleModel.findById(roleId).exec()
    if (!role) throw new Error('Role not found')

    // Check if assignment already exists
    const existing = await this.userRoleModel
      .findOne({
        userId: new Types.ObjectId(userId),
        roleId: new Types.ObjectId(roleId),
        subredditId: role.subredditId
      })
      .exec()

    if (existing) {
      return existing
    }

    const userRole = await this.userRoleModel.create({
      userId: new Types.ObjectId(userId),
      roleId: new Types.ObjectId(roleId),
      subredditId: role.subredditId,
      assignedBy: new Types.ObjectId(req.user.id)
    })

    // Invalidate cache for this specific user-subreddit combination
    if (role.subredditId) {
      await this.permissionsCache.invalidateModeratorStatus(String(role.subredditId), userId)
    }

    return userRole
  }

  // Remove role from user
  @Delete(':roleId/revoke/:userId')
  @UseGuards(JwtAuthGuard)
  async revokeRole(@Param('roleId') roleId: string, @Param('userId') userId: string) {
    const role = await this.roleModel.findById(roleId).exec()

    await this.userRoleModel
      .deleteOne({
        userId: new Types.ObjectId(userId),
        roleId: new Types.ObjectId(roleId)
      })
      .exec()

    // Invalidate cache for this specific user-subreddit combination
    if (role && role.subredditId) {
      await this.permissionsCache.invalidateModeratorStatus(String(role.subredditId), userId)
    }

    return { success: true }
  }
}
