import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { MailService } from './email.service';
import { MailOrderService } from './emailorder.service';

@Module({
  imports: [MailerModule],
  providers: [MailService, MailOrderService],
  exports: [MailService, MailOrderService],
})
export class MailModule { }
