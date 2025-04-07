import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { MailerModule } from '@nestjs-modules/mailer';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from './entities/user.entity';
import { OtpEntity } from 'src/otp/entities/otp.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, OtpEntity]), // ✅ On utilise OtpEntity directement
    // ✅ TypeORM correctement importé
    MailerModule.forRoot({
      transport: {
        host: process.env.MAILER_HOST,
        port: 587,
        secure: false, // false pour STARTTLS
        auth: {
          user: process.env.MAILER_USER,
          pass: process.env.MAILER_PASS,
        },
        tls: {
          minVersion: 'TLSv1.2',
        },
      },
      defaults: {
        from: `"No Reply" <${process.env.MAILER_USER}>`,
      },
    })
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule { }
