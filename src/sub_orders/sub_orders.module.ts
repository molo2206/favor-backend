import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubOrderEntity } from './entities/sub_order.entity';
import { SubOrdersController } from './sub_orders.controller';
import { SubOrderService } from './sub_orders.service';
import { SubOrderItemModule } from '../sub_order_items/sub_order_items.module'; // 👈 ajoute cette ligne

@Module({
  imports: [
    TypeOrmModule.forFeature([SubOrderEntity]),
    SubOrderItemModule, // 👈 importe le module qui fournit SubOrderItemService
  ],
  controllers: [SubOrdersController],
  providers: [SubOrderService],
  exports: [SubOrderService],
})
export class SubOrdersModule {}
