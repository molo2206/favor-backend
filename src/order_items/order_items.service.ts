import { Injectable } from '@nestjs/common';
import { OrderItemEntity } from './entities/order_item.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class OrderItemsService {
  constructor(
    @InjectRepository(OrderItemEntity)
    private readonly orderItemRepo: Repository<OrderItemEntity>,
  ) {}

  async create(data: { orderId: string; productId: string; quantity: number }): Promise<OrderItemEntity> {
    const orderItem = this.orderItemRepo.create({
      quantity: data.quantity,
      product: { id: data.productId },
      order: { id: data.orderId },
    });
  
    return await this.orderItemRepo.save(orderItem);
  }

  async removeByOrderId(orderId: string) {
    await this.orderItemRepo.delete({ orderId });
  }
  
  findAll() {
    return `This action returns all orderItems`;
  }

  findOne(id: number) {
    return `This action returns a #${id} orderItem`;
  }

  remove(id: number) {
    return `This action removes a #${id} orderItem`;
  }
}
