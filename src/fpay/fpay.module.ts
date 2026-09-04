// src/modules/fpay/fpay.module.ts

import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { FpayService } from './fpay.service';
import { FpayController } from './fpay.controller';
import { UserEntity } from 'src/users/entities/user.entity';
import { OtpEntity } from 'src/otp/entities/otp.entity';
import { MailService } from 'src/email/email.service';
import { SmsHelper } from 'src/users/utility/helpers/sms.helper';
import { UsersService } from 'src/users/users.service'; // ✅ IMPORTER UsersService
import { I18nService } from 'src/libs/common/src';

@Module({
    imports: [
        HttpModule.register({
            timeout: 30000,
            maxRedirects: 5,
        }),
        ConfigModule,
        TypeOrmModule.forFeature([
            UserEntity,
            OtpEntity,
        ]),
        JwtModule.registerAsync({
            useFactory: (configService: ConfigService) => ({
                secret: configService.get<string>('ACCESS_TOKEN_SECRET_KEY'),
                signOptions: { expiresIn: '48h' },
            }),
            inject: [ConfigService],
        }),
    ],
    controllers: [FpayController],
    providers: [
        FpayService,
        UsersService,      // ✅ AJOUTER UsersService
        MailService,
        SmsHelper,
        I18nService,
    ],
    exports: [FpayService, JwtModule],
})
export class FpayModule { }