import { Module } from '@nestjs/common';
import { TypeCompanyService } from './type_company.service';
import { TypeCompanyController } from './type_company.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeCompany } from './entities/type_company.entity';
@Module({
  imports: [TypeOrmModule.forFeature([TypeCompany])],
  controllers: [TypeCompanyController],
  providers: [TypeCompanyService],
  exports: [TypeCompanyService], // utile si d'autres modules ont besoin du service
})
export class TypeCompanyModule { }
