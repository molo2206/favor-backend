import { Module } from '@nestjs/common';
import { PermissionsController } from './permissions.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionService } from './permissions.service';
import { PermissionEntity } from './entities/permission.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PermissionEntity])],
  controllers: [PermissionsController],
  providers: [PermissionService],
  exports: [PermissionService], // Pour être utilisé ailleurs (ex : rôles)
})
export class PermissionsModule { }
