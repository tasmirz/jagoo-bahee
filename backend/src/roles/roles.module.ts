import { Module, forwardRef } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { Role, RoleSchema } from './schemas/role.schema'
import { UserRole, UserRoleSchema } from './schemas/user-role.schema'
import { RolesController } from './roles.controller'
import { SubredditsModule } from 'src/subreddits/subreddits.module'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Role.name, schema: RoleSchema },
      { name: UserRole.name, schema: UserRoleSchema }
    ]),
    forwardRef(() => SubredditsModule)
  ],
  controllers: [RolesController],
  providers: [],
  exports: [MongooseModule]
})
export class RolesModule {}
