import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserPlatformRoleService } from './user-platform-role.service';
import { UserEntity } from 'src/users/entities/user.entity';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { Resource } from 'src/ressource/entity/resource.entity';
import { PlatformEntity } from './entities/plateforms.entity';
import { RoleEntity } from './entities/roles.entity';
import { UserPlatformRoleEntity } from './entities/user_plateform_roles.entity';
import { BranchUserPlatformRoleResourceEntity } from './entities/branch-user-platform-role-resource.entity';
import { UserPlatformRoleController } from './userplatformrole.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      PlatformEntity,
      RoleEntity,
      BranchEntity,
      Resource,
      UserPlatformRoleEntity,
      BranchUserPlatformRoleResourceEntity, // ✅ ajouté ici
    ]),
  ],
  providers: [UserPlatformRoleService],
  controllers: [UserPlatformRoleController],
  exports: [UserPlatformRoleService],
})
export class UserPlatformRoleModule {}
