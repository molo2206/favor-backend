// src/modules/fpay/fpay.module.ts

import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { FpayService } from './fpay.service';
import { FpayController } from './fpay.controller';
import { UserEntity } from 'src/users/entities/user.entity';

@Module({
    imports: [
        HttpModule.register({
            timeout: 30000,
            maxRedirects: 5,
        }),
        ConfigModule,
        TypeOrmModule.forFeature([UserEntity]),
        JwtModule.registerAsync({
            useFactory: (configService: ConfigService) => ({
                secret: configService.get<string>('ACCESS_TOKEN_SECRET_KEY'),
                signOptions: { expiresIn: '48h' },
            }),
            inject: [ConfigService],
        }),
    ],
    controllers: [FpayController],
    providers: [FpayService],
    exports: [FpayService, JwtModule], // ✅ AJOUTER JwtModule dans exports
})
export class FpayModule { }