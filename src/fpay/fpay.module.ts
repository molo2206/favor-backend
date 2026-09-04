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
import { I18nService } from 'src/libs/common/src';
import { UsersModule } from 'src/users/users.module';  // ✅ IMPORTER UsersModule

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
        UsersModule,  // ✅ IMPORTER UsersModule (qui exporte UsersService et les repositories)
    ],
    controllers: [FpayController],
    providers: [
        FpayService,
        MailService,
        SmsHelper,
        I18nService,
        // ❌ SUPPRIMER UsersService d'ici car il est fourni par UsersModule
    ],
    exports: [FpayService, JwtModule],
})
export class FpayModule { }