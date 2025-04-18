import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { MailerModule } from '@nestjs-modules/mailer';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from './entities/user.entity';
import { OtpEntity } from 'src/otp/entities/otp.entity';
import { JwtModule } from '@nestjs/jwt'; // 👈 à ajouter
import { ConfigModule, ConfigService } from '@nestjs/config';
@Module({
  imports: [
    ConfigModule, // 👈 assure l'injection
    TypeOrmModule.forFeature([UserEntity, OtpEntity]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => ({
        secret: config.get<string>('ACCESS_TOKEN_SECRET_KEY'),
        signOptions: { expiresIn: '1h' },
      }),
    }),
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => ({
        transport: {
          host: config.get('MAILER_HOST'),
          port: 465,
          secure: false,
          auth: {
            user: config.get('MAILER_USER'),
            pass: config.get('MAILER_PASS'),
          },
          tls: {
            minVersion: 'TLSv1.2',
          },
        },
        defaults: {
          from: `"No Reply" <${config.get('MAILER_USER')}>`,
        },
      }),
    }),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
 export class UsersModule {}
