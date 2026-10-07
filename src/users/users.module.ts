// apps/users/users.module.ts

import { Module, forwardRef } from '@nestjs/common';  // ✅ AJOUTER forwardRef
import { HttpModule } from '@nestjs/axios';  // ✅ AJOUTER HttpModule
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from './entities/user.entity';
import { UserHasResourceEntity } from './entities/user-has-resource.entity';
import { Resource } from 'src/ressource/entity/resource.entity';
import { OtpEntity } from 'src/otp/entities/otp.entity';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CloudinaryService } from './utility/helpers/cloudinary.service';
import { MailModule } from 'src/email/email.module';
import { TauxCompany } from 'src/taux-company/entities/taux-company.entity';
import { SmsHelper } from './utility/helpers/sms.helper';
import { NotificationsModule } from 'src/notification/notifications.module';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { FilesService } from 'src/files/files.service';
import { UserSettingsEntity } from './entities/user-settings.entity';
import { CommonModule } from 'src/libs/common/src/common.module';
import { UserLoyaltyEntity } from './entities/user-loyalty.entity';
import { ReferralEntity } from './entities/referral.entity';
import { FpayModule } from 'src/fpay/fpay.module';

@Module({
  imports: [
    // ✅ AJOUTER HttpModule pour FpayService
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => ({
        timeout: 30000,
        maxRedirects: 5,
      }),
    }),
    TypeOrmModule.forFeature([
      UserEntity,
      OtpEntity,
      TauxCompany,
      UserHasResourceEntity,
      Resource,
      CompanyEntity,
      BranchEntity,
      UserSettingsEntity,
      UserLoyaltyEntity,
      ReferralEntity
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => ({
        secret: config.get<string>('ACCESS_TOKEN_SECRET_KEY'),
        signOptions: { expiresIn: '1h' },
      }),
    }),
    MailModule,
    NotificationsModule,
    CommonModule,
    // ✅ Utiliser forwardRef pour éviter la dépendance circulaire
    forwardRef(() => FpayModule),
  ],
  controllers: [UsersController],
  providers: [
    UsersService,
    CloudinaryService,
    SmsHelper,
    FilesService,
    // ❌ SUPPRIMER FpayService des providers (il est fourni par FpayModule)
    // FpayService,  // ← SUPPRIMER
  ],
  exports: [
    UsersService,
    TypeOrmModule.forFeature([UserEntity, OtpEntity]),
    // ❌ SUPPRIMER FpayService des exports (il est exporté par FpayModule)
    // FpayService,  // ← SUPPRIMER
  ],
})
export class UsersModule {}