import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoomAvailabilityService } from './room-availability.service';
import { RoomAvailability } from './entity/RoomAvailability.entity';
import { Product } from 'src/products/entities/product.entity';
import { Reservation } from './entity/Reservation.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { RoomAvailabilityController } from './room-availability.controller';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { MailModule } from 'src/email/email.module';
import { InvoiceModule } from 'src/order/invoice/invoice.module';
import { PdfModule } from 'src/pdf/pdf.module';
import { SmsHelper } from 'src/users/utility/helpers/sms.helper';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RoomAvailability,
      Product,
      Reservation,
      UserEntity,
      CompanyEntity,
    ]),
    MailModule,
    InvoiceModule,
    PdfModule,
  ],
  providers: [RoomAvailabilityService,SmsHelper],
  controllers: [RoomAvailabilityController], 
  exports: [RoomAvailabilityService],
})
export class RoomAvailabilityModule {}
