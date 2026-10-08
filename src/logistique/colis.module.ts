import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ColisEntity } from './entity/colis.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { ColisService } from './colis.service';
import { ColisController } from './colis.controller';
import { ColisTrackingEntity } from './entity/colis-tracking.entity';
import { MailModule } from 'src/email/email.module';
import { InvoiceModule } from 'src/order/invoice/invoice.module';
import { PdfModule } from 'src/pdf/pdf.module';
import { SmsHelper } from 'src/users/utility/helpers/sms.helper';
@Module({
  imports: [
    TypeOrmModule.forFeature([ColisTrackingEntity, ColisEntity, UserEntity]),
    MailModule,
    InvoiceModule,
    PdfModule,
  ],
  providers: [ColisService,SmsHelper],
  controllers: [ColisController],
})
export class ColisModule {}
