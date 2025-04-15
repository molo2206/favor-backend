// src/company/company.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyEntity } from './entities/company.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { UserHasCompanyEntity } from 'src/user_has_company/entities/user_has_company.entity';
import { CompanyService } from './company.service';
import { CompanyController } from './company.controller';
import { UserHasCompanyModule } from 'src/user_has_company/user_has_company.module'; // 👈 ici
import { RoleUser } from 'src/role_user/entities/role_user.entity';
import { TypeCompanyModule } from 'src/type_company/type_company.module';
import { TypeCompany } from 'src/type_company/entities/type_company.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CompanyEntity,
      UserEntity,
      UserHasCompanyEntity,
      RoleUser,
      TypeCompany
    ]),
    UserHasCompanyModule, // 👈 ne surtout pas oublier
    TypeCompanyModule,
  ],
  controllers: [CompanyController],
  providers: [CompanyService],
})
export class CompanyModule { }
