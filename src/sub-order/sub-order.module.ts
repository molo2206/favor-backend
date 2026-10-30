import { Module } from '@nestjs/common';
import { SubOrderService } from './sub-order.service';
import { SubOrderController } from './sub-order.controller';

@Module({
  controllers: [SubOrderController],
  providers: [SubOrderService],
})
export class SubOrderModule {}
