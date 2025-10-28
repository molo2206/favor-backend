import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from './entities/user.entity';
import { OtpEntity } from 'src/otp/entities/otp.entity';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CloudinaryService } from './utility/helpers/cloudinary.service';
import { MailModule } from 'src/email/email.module';
import { TauxCompany } from 'src/taux-company/entities/taux-company.entity';
import { SmsHelper } from './utility/helpers/sms.helper';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      OtpEntity,
      TauxCompany,
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const secret = config.get<string>('ACCESS_TOKEN_SECRET_KEY');
        if (!secret) {
          throw new Error('ACCESS_TOKEN_SECRET_KEY is undefined!');
        }
        return {
          secret,
          signOptions: { expiresIn: '1h' },
        };
      },
    }),
    MailModule,
  ],
  controllers: [UsersController],
  providers: [UsersService, CloudinaryService,SmsHelper],
  exports: [
    UsersService,
    TypeOrmModule.forFeature([
      UserEntity,
      OtpEntity,
    ]),
  ],
})
export class UsersModule {}
