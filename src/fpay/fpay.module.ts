// src/modules/fpay/fpay.module.ts

import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt'; // ✅ Garder l'import
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
        JwtModule, // ✅ Juste JwtModule sans configuration
    ],
    controllers: [FpayController],
    providers: [FpayService],
    exports: [FpayService],
})
export class FpayModule { }