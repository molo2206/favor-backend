import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SmsService } from './sms.service';
import { SmsQuotaService } from './sms-quota.service';
import { SmsQuotaController } from './sms-quota.controller';
import { SmsRechargeEntity } from './entity/sms-recharge.entity';
import { SmsLogEntity } from './entity/sms-log.entity';
import { CountryProvider } from 'src/pawapay/entity/country-provider.entity';
import { Country } from 'src/company/entities/country.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CountryProvider,    // pour SmsService (envoi réel)
      SmsRechargeEntity,  // pour SmsQuotaService
      SmsLogEntity,       // pour SmsQuotaService
      Country,            // ✅ quotas SMS par pays (table countries)
    ]),
  ],
  providers: [
    SmsService,           // ✅ Envoi réel
    SmsQuotaService,      // ✅ Gestion quota
  ],
  controllers: [
    SmsQuotaController,   // ✅ API REST
  ],
  exports: [
    SmsService,           // ✅ Exporté
    SmsQuotaService,      // ✅ Exporté
  ],
})
export class SmsModule { }