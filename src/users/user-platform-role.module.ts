import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserPlatformRoleService } from './user-platform-role.service';
import { UserPlatformRoleEntity } from './entities/user_plateform_roles.entity';
import { UserEntity } from './entities/user.entity';
import { PlatformEntity } from './entities/plateforms.entity';
import { RoleEntity } from './entities/roles.entity';
import { UserPlatformRoleController } from './userplatformrole.controller';

@Module({
  imports: [TypeOrmModule.forFeature([UserPlatformRoleEntity, UserEntity, PlatformEntity, RoleEntity])],
  providers: [UserPlatformRoleService],
  controllers: [UserPlatformRoleController],
  exports: [UserPlatformRoleService],
})
export class UserPlatformRoleModule {}
