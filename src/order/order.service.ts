// order.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderEntity } from './entities/order.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderItemEntity } from 'src/order-item/entities/order-item.entity';
import { SubOrderEntity } from 'src/sub-order/entities/sub-order.entity';
import { SubOrderItemEntity } from 'src/sub-order-item/entities/sub-order-item.entity';
import { Product } from 'src/products/entities/product.entity';
import { AddressUser } from 'src/address-user/entities/address-user.entity';

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly orderRepo: Repository<OrderEntity>,

    @InjectRepository(OrderItemEntity)
    private readonly orderItemRepo: Repository<OrderItemEntity>,

    @InjectRepository(SubOrderEntity)
    private readonly subOrderRepo: Repository<SubOrderEntity>,

    @InjectRepository(SubOrderItemEntity)
    private readonly subOrderItemRepo: Repository<SubOrderItemEntity>,

    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,

    @InjectRepository(AddressUser)
    private readonly addressUserRepo: Repository<AddressUser>,
  ) { }

  async createOrder(
    createOrderDto: CreateOrderDto,
    user: UserEntity,
  ): Promise<OrderEntity> {
    const {
      totalAmount,
      shippingCost,
      currency,
      orderItems,
    } = createOrderDto;

    const addressUser = await this.addressUserRepo.findOne({
      where: { id: createOrderDto.addressUserId },
    });
    if (!addressUser) {
      throw new NotFoundException('Address not found');
    }

    const grandTotal = totalAmount + shippingCost;
    const order = this.orderRepo.create({
      user,
      totalAmount,
      shippingCost,
      currency,
      grandTotal,
      addressUser,
    });
    await this.orderRepo.save(order);

    const orderItemEntities: OrderItemEntity[] = [];
    const groupedByCompany = new Map<
      string,
      {
        companyId: string;
        items: SubOrderItemEntity[];
        total: number;
      }
    >();

    for (const item of orderItems) {
      const product = await this.productRepo.findOne({
        where: { id: item.productId },
        relations: ['company'],
      });
      if (!product) throw new NotFoundException(`Product not found: ${item.productId}`);

      // Création de l'OrderItem (lié à la commande principale)
      const orderItem = this.orderItemRepo.create({
        order,
        product,
        quantity: item.quantity,
      });
      orderItemEntities.push(orderItem);

      // Groupe par entreprise
      const companyId = product.company.id;
      if (!groupedByCompany.has(companyId)) {
        groupedByCompany.set(companyId, {
          companyId,
          items: [],
          total: 0,
        });
      }

      const group = groupedByCompany.get(companyId)!;

      // Création du SubOrderItem (pas encore de subOrder, sera lié ensuite)
      const subOrderItem = this.subOrderItemRepo.create({
        product,
        quantity: item.quantity,
      });

      group.items.push(subOrderItem);
      group.total += product.price * item.quantity;
    }

    await this.orderItemRepo.save(orderItemEntities);

    for (const [, group] of groupedByCompany) {
      const subOrder = this.subOrderRepo.create({
        order,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        company: { id: group.companyId } as any,
        totalAmount: group.total,
      });

      await this.subOrderRepo.save(subOrder);

      for (const item of group.items) {
        item.subOrder = subOrder;
      }

      await this.subOrderItemRepo.save(group.items);
    }

    const finalOrder = await this.orderRepo.findOne({
      where: { id: order.id },
      relations: [
        'orderItems',
        'subOrders',
        'subOrders.items',
        'subOrders.company',
        'orderItems.product',
        'addressUser'
      ],
    });

    if (!finalOrder) {
      throw new NotFoundException('Order not found after creation');
    }

    return finalOrder;
  }

  async getOrdersByUser(userId: string): Promise<OrderEntity[]> {
    return this.orderRepo.find({
      where: { user: { id: userId } },
      relations: [
        'orderItems',
        'orderItems.product',
        'subOrders',
        'subOrders.items',
        'subOrders.items.product',
        'subOrders.company',
        'addressUser'
      ],
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async findOne(orderId: string): Promise<OrderEntity> {
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: ['orderItems', 'subOrders', 'subOrders.items', 'subOrders.company', 'addressUser'],
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async findAll(): Promise<OrderEntity[]> {
    return this.orderRepo.find({
      relations: ['orderItems', 'subOrders', 'subOrders.items', 'subOrders.company', 'user', 'addressUser'],
      order: { createdAt: 'DESC' },
    });
  }
  
}
