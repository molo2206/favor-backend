import { Module } from '@nestjs/common';
import { UserHasCompanyService } from './user_has_company.service';
import { UserHasCompanyController } from './user_has_company.controller';

@Module({
  controllers: [UserHasCompanyController],
  providers: [UserHasCompanyService],
})
export class UserHasCompanyModule {}
