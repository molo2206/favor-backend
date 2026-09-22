import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoleUser } from './entities/role_user.entity';
import { RoleUserController } from './role_user.controller';
import { RoleUserService } from './role_user.service';

@Module({
  imports: [TypeOrmModule.forFeature([RoleUser])],
  controllers: [RoleUserController],
  providers: [RoleUserService],
  exports: [RoleUserService],
})
export class RoleUserModule { }
