// exchange-rate.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt'; // ✅ Ajout pour JwtService
import { HttpModule } from '@nestjs/axios'; // ✅ Ajout pour HttpService
import { ConfigService } from '@nestjs/config'; // ✅ Ajout pour ConfigService

import { ExchangeRateController } from './exchange-rate.controller';
import { ExchangeRateService } from './exchange-rate.service';
import { ExchangeRateEntity } from './entities/exchange-rate.entity';
import { I18nModule } from 'src/libs/common/src';
import { Country } from 'src/company/entities/country.entity';
import { UserSettingsEntity } from 'src/users/entities/user-settings.entity'; // ✅ Ajout

@Module({
    imports: [
        TypeOrmModule.forFeature([
            ExchangeRateEntity,
            Country,
            UserSettingsEntity, // ✅ Ajout de UserSettingsEntity
        ]),
        I18nModule,
        HttpModule,
        JwtModule.registerAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                secret: config.get('JWT_SECRET_KEY'),
                signOptions: { expiresIn: '7d' },
            }),
        }), // ✅ Ajout de JwtModule
    ],
    controllers: [ExchangeRateController],
    providers: [ExchangeRateService],
    exports: [ExchangeRateService],
})
export class ExchangeRateModule { }