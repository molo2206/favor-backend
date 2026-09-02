// exchange-rate.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExchangeRateController } from './exchange-rate.controller';
import { ExchangeRateService } from './exchange-rate.service';
import { ExchangeRateEntity } from './entities/exchange-rate.entity';
import { I18nModule } from 'src/libs/common/src';
import { HttpModule } from '@nestjs/axios'; // ✅ Ajout pour HttpService
import { Country } from 'src/company/entities/country.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([ExchangeRateEntity, Country]), 
        I18nModule,
        HttpModule, 
    ],
    controllers: [ExchangeRateController],
    providers: [ExchangeRateService],
    exports: [ExchangeRateService],
})
export class ExchangeRateModule { }