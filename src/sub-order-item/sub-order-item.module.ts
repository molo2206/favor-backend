import { Module } from '@nestjs/common';
import { SubOrderItemService } from './sub-order-item.service';
import { SubOrderItemController } from './sub-order-item.controller';

@Module({
  controllers: [SubOrderItemController],
  providers: [SubOrderItemService],
})
export class SubOrderItemModule {}
