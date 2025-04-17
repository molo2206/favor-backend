import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderEntity } from './entities/order.entity';
import { SubOrderService } from 'src/sub_orders/sub_orders.service';
import { UserEntity } from 'src/users/entities/user.entity';
import { plainToClass } from 'class-transformer';
import { OrderItemsService } from 'src/order_items/order_items.service';
import { SubOrderItemService } from 'src/sub_order_items/sub_order_items.service';
import { CreateSubOrderDto } from 'src/sub_orders/dto/create-sub_order.dto';
import { SubOrderEntity } from 'src/sub_orders/entities/sub_order.entity';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrderStatus } from './enum/orderstatus.enum';

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly orderRepo: Repository<OrderEntity>,
    private readonly orderItemService: OrderItemsService,
    private readonly subOrderService: SubOrderService,
    private readonly subOrderItemService: SubOrderItemService,
  ) { }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async create(
    orderDto: CreateOrderDto,
    userId: string,
    user: UserEntity,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    const { subOrders = [], orderItems = [], ...orderData } = orderDto;

    const order = this.orderRepo.create({
      ...orderData,
      userId,
    });
    const savedOrder = await this.orderRepo.save(order);

    if (orderItems.length > 0) {
      await Promise.all(
        orderItems.map((item) => {
          return this.orderItemService.create({
            productId: item.productId,
            quantity: item.quantity,
            orderId: savedOrder.id,
          });
        }),
      );
    }

    const savedSubOrders: SubOrderEntity[] = [];

    for (const { items = [], ...subOrderInfo } of subOrders) {
      const subOrderPayload: CreateSubOrderDto = {
        ...subOrderInfo,
        orderId: savedOrder.id,
        items,
      };

      const savedSubOrder = await this.subOrderService.create(subOrderPayload, user);
      savedSubOrders.push(savedSubOrder);

      if (items.length > 0) {
        await Promise.all(
          items.map((item) => {
            return this.subOrderItemService.create({
              productId: item.productId,
              quantity: item.quantity,
              subOrderId: savedSubOrder.id,
              price: item.price,
            });
          }),
        );
      }
    }

    const fullOrder = await this.orderRepo.findOne({
      where: { id: savedOrder.id },
      relations: [
        'orderItems',
        'orderItems.product',
        'subOrders',
        'subOrders.subOrderItems',
        'subOrders.subOrderItems.product',
        'user',
      ],
    });

    if (!fullOrder) {
      throw new Error('Commande non trouvée après création');
    }

    const formatted = {
      ...fullOrder,
      user: plainToClass(UserEntity, user),
      orderItems: (fullOrder.orderItems || []).map((item) => ({
        ...item,
        productName: item.product?.name || null,
      })),
      subOrders: (fullOrder.subOrders || []).map((sub) => ({
        ...sub,
        subOrderItems: (sub.subOrderItems || []).map((item) => ({
          ...item,
          productName: item.product?.name || null,
        })),
      })),
    };

    return formatted;
  }

  async update(
    orderId: string,
    orderDto: UpdateOrderDto,
    user: UserEntity,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    const existingOrder = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: ['orderItems', 'subOrders', 'subOrders.subOrderItems'],
    });

    if (!existingOrder) {
      throw new NotFoundException('Commande introuvable');
    }

    // 🧹 1. Supprimer les anciens items
    await this.orderItemService.removeByOrderId(orderId);
    for (const subOrder of existingOrder.subOrders) {
      await this.subOrderItemService.removeBySubOrderId(subOrder.id);
    }
    await this.subOrderService.removeByOrderId(orderId);

    // 🛠️ 2. Mettre à jour la commande
    const updatedOrder = { ...existingOrder, ...orderDto };
    await this.orderRepo.save(updatedOrder);

    // 🔁 3. Recréer les items et sous-commandes
    const { subOrders = [], orderItems = [] } = orderDto;

    const order = await this.orderRepo.findOneOrFail({ where: { id: orderId } });

    if (orderItems.length > 0) {
      await Promise.all(
        orderItems.map((item) =>
          this.orderItemService.create({
            productId: item.productId,
            quantity: item.quantity,
            orderId: order.id,
          }),
        ),
      );
    }

    const savedSubOrders: SubOrderEntity[] = [];

    for (const { items = [], ...subOrderInfo } of subOrders) {
      const subOrderPayload: CreateSubOrderDto = {
        ...subOrderInfo,
        orderId: order.id,
        items,
      };

      const savedSubOrder = await this.subOrderService.create(subOrderPayload, user);
      savedSubOrders.push(savedSubOrder);

      if (items.length > 0) {
        await Promise.all(
          items.map((item) =>
            this.subOrderItemService.create({
              productId: item.productId,
              quantity: item.quantity,
              subOrderId: savedSubOrder.id,
              price: item.price,
            }),
          ),
        );
      }
    }

    const fullOrder = await this.orderRepo.findOne({
      where: { id: order.id },
      relations: [
        'orderItems',
        'orderItems.product',
        'subOrders',
        'subOrders.subOrderItems',
        'subOrders.subOrderItems.product',
        'user',
      ],
    });

    if (!fullOrder) {
      throw new Error('Commande non trouvée après mise à jour');
    }

    const formatted = {
      ...fullOrder,
      user: plainToClass(UserEntity, user),
      orderItems: (fullOrder.orderItems || []).map((item) => ({
        ...item,
        productName: item.product?.name || null,
      })),
      subOrders: (fullOrder.subOrders || []).map((sub) => ({
        ...sub,
        subOrderItems: (sub.subOrderItems || []).map((item) => ({
          ...item,
          productName: item.product?.name || null,
        })),
      })),
    };

    return formatted;
  }

  async findAll(): Promise<OrderEntity[]> {
    return this.orderRepo.find({
      relations: [
        'orderItems',
        'orderItems.product',
        'subOrders',
        'subOrders.subOrderItems',
        'subOrders.subOrderItems.product',
        'user',
      ],
    });
  }

  async findUserOrdersByStatus(userId: string, status: OrderStatus): Promise<OrderEntity[]> {
    return this.orderRepo.find({
      where: {
        user: { id: userId },
        status,
      },
      relations: [
        'orderItems',
        'orderItems.product',
        'subOrders',
        'subOrders.subOrderItems',
        'subOrders.subOrderItems.product',
      ],
      order: { createdAt: 'DESC' },
    });
  }

  async findAllByUserOrder(userId: string): Promise<OrderEntity[]> {
    return this.orderRepo.find({
      where: { userId }, // Filtrer les commandes par utilisateur
      relations: [
        'orderItems',
        'orderItems.product',
        'subOrders',
        'subOrders.subOrderItems',
        'subOrders.subOrderItems.product',
        'user',
      ],
      order: { createdAt: 'DESC' }, // Optionnel : tri des commandes par date de création
    });
  }

  async findOrdersByCompany(companyId: string): Promise<OrderEntity[]> {
    return this.orderRepo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.orderItems', 'orderItem')
      .leftJoinAndSelect('orderItem.product', 'product')
      .leftJoinAndSelect('order.subOrders', 'subOrder')
      .leftJoinAndSelect('subOrder.subOrderItems', 'subOrderItem')
      .leftJoinAndSelect('subOrderItem.product', 'subOrderProduct')
      .where('product.companyId = :companyId OR subOrderProduct.companyId = :companyId', { companyId })
      .orderBy('order.createdAt', 'DESC')
      .getMany();
  }
  async findOrdersStatusByCompany(companyId: string, status?: OrderStatus): Promise<OrderEntity[]> {
    const query = this.orderRepo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.orderItems', 'orderItem')
      .leftJoinAndSelect('orderItem.product', 'product')
      .leftJoinAndSelect('order.subOrders', 'subOrder')
      .leftJoinAndSelect('subOrder.subOrderItems', 'subOrderItem')
      .leftJoinAndSelect('subOrderItem.product', 'subOrderProduct')
      .leftJoinAndSelect('order.user', 'user')
      .where(
        'product.companyId = :companyId OR subOrderProduct.companyId = :companyId',
        { companyId }
      );

    if (status) {
      query.andWhere('order.status = :status', { status });
    }

    return query.getMany();
  }



  async findOne(id: string): Promise<OrderEntity> {
    const order = await this.orderRepo.findOne({ where: { id }, relations: ['subOrders'] });
    if (!order) throw new NotFoundException('Commande non trouvée');
    return order;
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.orderRepo.delete(id);
  }
}