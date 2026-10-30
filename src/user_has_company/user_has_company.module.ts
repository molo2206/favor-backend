import { Module } from '@nestjs/common';
import { UserHasCompanyService } from './user_has_company.service';
import { UserHasCompanyController } from './user_has_company.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserHasCompanyEntity } from './entities/user_has_company.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UserHasCompanyEntity])],
  controllers: [UserHasCompanyController],
  providers: [UserHasCompanyService],
  exports: [UserHasCompanyService], // 👈 nécessaire pour être utilisé dans un autre module
})
export class UserHasCompanyModule {}
