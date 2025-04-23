import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderItemsService } from './order_items.service';
import { OrderItemEntity } from './entities/order_item.entity';

@Module({
  imports: [TypeOrmModule.forFeature([OrderItemEntity])], // Assure-toi d'importer le repository ici
  providers: [OrderItemsService],
  exports: [OrderItemsService],
})
export class OrderItemsModule {}
