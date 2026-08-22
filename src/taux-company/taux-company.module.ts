import { Module } from '@nestjs/common';
import { TauxCompanyService } from './taux-company.service';
import { TauxCompanyController } from './taux-company.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { TauxCompany } from './entities/taux-company.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TauxCompany, CompanyEntity])],
  controllers: [TauxCompanyController],
  providers: [TauxCompanyService],
  exports: [TypeOrmModule], // ✅ permet à d'autres modules (comme CompanyModule) d'utiliser le repo
})
export class TauxCompanyModule {}
