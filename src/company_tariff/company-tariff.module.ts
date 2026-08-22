// src/company-tariff/company-tariff.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyTariffEntity } from './entities/company-tariff.entity';
import { CompanyTariffController } from './company-tariff.controller';
import { CompanyTariffService } from './company-tariff.service';
import { CompanyEntity } from 'src/company/entities/company.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CompanyTariffEntity, CompanyEntity])],
  controllers: [CompanyTariffController],
  providers: [CompanyTariffService],
  exports: [CompanyTariffService],
})
export class CompanyTariffModule {}
