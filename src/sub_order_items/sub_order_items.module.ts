import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubOrderItemEntity } from './entities/sub_order_item.entity';
import { SubOrderItemService } from './sub_order_items.service';
import { SubOrderItemsController } from './sub_order_items.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([SubOrderItemEntity]),
  ],
  controllers: [SubOrderItemsController],
  providers: [SubOrderItemService],
  exports: [SubOrderItemService], // Permet d'utiliser le service dans d'autres modules
})
export class SubOrderItemModule {}
