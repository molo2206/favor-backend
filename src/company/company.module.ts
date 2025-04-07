import { Module } from '@nestjs/common';
import { CompanyService } from './company.service';
import { CompanyController } from './company.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyEntity } from './entities/company.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { UserHasCompanyEntity } from 'src/user_has_company/entities/user_has_company.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CompanyEntity,
      UserEntity,
      UserHasCompanyEntity,
    ]),
  ],
  providers: [CompanyService],
  controllers: [CompanyController],
})
export class CompanyModule {}

