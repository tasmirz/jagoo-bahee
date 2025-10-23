import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { RolesController } from './roles.controller'
import { Role, RoleSchema } from './schemas/role.schema'
import { UserRole, UserRoleSchema } from './schemas/user-role.schema'
import { User, UserSchema } from 'src/users/schemas/user.schema'
import { SubredditsModule } from 'src/subreddits/subreddits.module'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Role.name, schema: RoleSchema },
      { name: UserRole.name, schema: UserRoleSchema },
      { name: User.name, schema: UserSchema }
    ]),
    SubredditsModule
  ],
  controllers: [RolesController],
  exports: [MongooseModule]
})
export class RolesModule {}
