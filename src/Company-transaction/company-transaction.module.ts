// src/company/company-transaction.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Shipment } from 'src/shipment/entity/shipment.entity';
import { LtaEntity } from 'src/shipment/Lta/entity/lta.entity';
import { CompanyTransactionEntity } from './entity/company-transaction.entity';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { CompanyTransactionController } from './company-transaction.controller';
import { CompanyTransactionService } from './company-transaction.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CompanyTransactionEntity,
      CompanyEntity,
      Shipment,
      LtaEntity,
    ]),
  ],
  controllers: [CompanyTransactionController],
  providers: [CompanyTransactionService],
  exports: [CompanyTransactionService],
})
export class CompanyTransactionModule {}
