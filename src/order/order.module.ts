import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { OrderEntity } from './entities/order.entity';
import { SubOrdersModule } from 'src/sub_orders/sub_orders.module';
import { OrderItemsModule } from 'src/order_items/order_items.module';
import { SubOrderItemModule } from 'src/sub_order_items/sub_order_items.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([OrderEntity]),
    SubOrdersModule,
    OrderItemsModule,
    SubOrderItemModule,  // Ajouter ici
  ],
  controllers: [OrderController],
  providers: [OrderService],
})
export class OrderModule {}
