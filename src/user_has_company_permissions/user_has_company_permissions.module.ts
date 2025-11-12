import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserHasCompanyPermissionEntity } from './entities/user_has_company_permission.entity';
import { UserHasCompanyEntity } from 'src/user_has_company/entities/user_has_company.entity';
import { PermissionEntity } from 'src/permissions/entities/permission.entity';
import { UserHasCompanyPermissionService } from './user_has_company_permissions.service';
import { UserHasCompanyController } from './user_has_company_permissions.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserHasCompanyPermissionEntity,
      UserHasCompanyEntity,
      PermissionEntity,
    ]),
  ],
  controllers: [UserHasCompanyController],
  providers: [UserHasCompanyPermissionService],
})
export class UserHasCompanyPermissionsModule { }