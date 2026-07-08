// src/cron/cron.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyFeeCronService } from './company-fee.cron.service';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { LtaEntity } from 'src/shipment/Lta/entity/lta.entity';
import { Shipment } from 'src/shipment/entity/shipment.entity';
import { CompanyTransactionEntity } from 'src/Company-transaction/entity/company-transaction.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CompanyEntity,
      CompanyTransactionEntity,
      LtaEntity,
      Shipment,
    ]),
  ],
  providers: [CompanyFeeCronService],
  exports: [CompanyFeeCronService],
})
export class CronModule {}