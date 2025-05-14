import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderService } from './order.service';
import { OrderEntity } from './entities/order.entity';
import { OrderItemEntity } from '../order-item/entities/order-item.entity';
import { SubOrderEntity } from '../sub-order/entities/sub-order.entity';
import { AddressUser } from '../address-user/entities/address-user.entity'; // import entity
import { AddressUserModule } from '../address-user/address-user.module'; // import module
import { SubOrderItemEntity } from 'src/sub-order-item/entities/sub-order-item.entity';
import { Product } from 'src/products/entities/product.entity';
import { OrderController } from './order.controller';
import { MailModule } from 'src/email/email.module';
import { InvoiceModule } from 'src/users/utility/common/invoice.module';
import { PdfModule } from 'src/pdf/pdf.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrderEntity,
      OrderItemEntity,
      SubOrderEntity,
      SubOrderItemEntity,
      Product,
      AddressUser,
    ]),
    AddressUserModule,
    MailModule,
    InvoiceModule,
    PdfModule,
  ],

  providers: [OrderService],
  controllers: [OrderController],
})
export class OrderModule {}
