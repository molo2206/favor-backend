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
import { InvoiceService } from 'src/users/utility/common/invoice.util';
import { MailOrderService } from 'src/email/emailorder.service';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrderStatus } from 'src/users/utility/common/order.status.enum';
import { CompanyActivity } from 'src/users/utility/common/activity.company.enum';
import { PaymentStatus } from 'src/users/utility/common/payment.status.enum';
import { PdfService } from 'src/pdf/pdf.service';

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

    private readonly mailService: MailOrderService,
    private readonly pdfService: PdfService,

    private readonly invoiceService: InvoiceService,
  ) {}

  async createOrder(
    createOrderDto: CreateOrderDto,
    user: UserEntity,
  ): Promise<OrderEntity> {
    const {
      totalAmount,
      shippingCost,
      currency,
      orderItems,
      addressUserId,
      type,
      shopType,
    } = createOrderDto;

    const addressUser = await this.addressUserRepo.findOne({
      where: { id: addressUserId },
    });
    if (!addressUser) throw new NotFoundException('Address not found');

    const grandTotal = totalAmount + shippingCost;
    const invoiceNumb = this.invoiceService.generateInvoiceNumber();
    const order = this.orderRepo.create({
      user,
      totalAmount,
      shippingCost,
      currency,
      grandTotal,
      addressUser,
      type,
      invoiceNumber: invoiceNumb,
      paymentStatus: PaymentStatus.PENDING,
    });
    await this.orderRepo.save(order);

    const orderItemEntities: OrderItemEntity[] = [];
    const groupedByCompany = new Map<
      string,
      { companyId: string; items: SubOrderItemEntity[]; total: number }
    >();

    for (const item of orderItems) {
      const product = await this.productRepo.findOne({
        where: { id: item.productId },
        relations: ['company'],
      });
      if (!product)
        throw new NotFoundException(`Product not found: ${item.productId}`);

      let selectedPrice = product.detail_price_original ?? 0;
      if (
        shopType === CompanyActivity.WHOLESALER ||
        shopType === CompanyActivity.WHOLESALER_RETAILER
      ) {
        selectedPrice =
          product.gros_price_original ?? product.detail_price_original ?? 0;
      }

      const orderItem = this.orderItemRepo.create({
        order,
        product,
        quantity: item.quantity,
      });
      orderItemEntities.push(orderItem);

      const companyId = product.company.id;
      if (!groupedByCompany.has(companyId)) {
        groupedByCompany.set(companyId, {
          companyId,
          items: [],
          total: 0,
        });
      }

      const group = groupedByCompany.get(companyId)!;
      const subOrderItem = this.subOrderItemRepo.create({
        product,
        quantity: item.quantity,
      });

      group.items.push(subOrderItem);
      group.total += selectedPrice * item.quantity;
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

      // Génération du numéro de facture unique
      subOrder.invoiceNumber = invoiceNumb;
      await this.subOrderRepo.save(subOrder);

      for (const item of group.items) {
        item.subOrder = subOrder;
      }
      await this.subOrderItemRepo.save(group.items);
    }

    const finalOrder = await this.orderRepo.findOne({
      where: { id: order.id },
      relations: [
        'orderItems.product',
        'orderItems.product.category',
        'orderItems.product.measure',
        'subOrders',
        'subOrders.items.product',
        'subOrders.items.product.category',
        'subOrders.items.product.measure',
        'subOrders.company',
        'user',
        'addressUser',
      ],
    });

    if (!finalOrder)
      throw new NotFoundException('Order not found after creation');

    const subOrders = await this.subOrderRepo.find({
      where: { order: { id: finalOrder.id } },
      relations: ['company', 'items', 'items.product', 'order'],
    });

    // const pdfBuffer = await this.pdfService.generateInvoicePdf({
    //   user,
    //   order: finalOrder,
    //   subOrders,
    // });

    // await this.mailService.sendEmailWithAttachment(
    //   user.email,
    //   'Votre facture - FavorHelp',
    //   'Veuillez trouver votre facture ci-jointe.', // <- text fallback
    //   'facture.pdf', // <- filename
    //   pdfBuffer, // <- file buffer
    //   '<p>Veuillez trouver votre facture ci-jointe.</p>', // <- htmlContent (optionnel)
    // );

    await this.mailService.sendHtmlEmail(
      user.email,
      'Votre facture - FavorHelp',
      'invoice.html',
      {
        user,
        order: finalOrder,
        subOrders,
      },
    );

    return finalOrder;
  }

  async updateOrderStatus(
    orderId: string,
    dto: UpdateOrderStatusDto,
  ): Promise<OrderEntity> {
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: [
        'orderItems.product',
        'orderItems.product.category',
        'orderItems.product.measure',
        'subOrders',
        'subOrders.items.product',
        'subOrders.items.product.category',
        'subOrders.items.product.measure',
        'subOrders.company',
        'user',
        'addressUser',
      ],
    });

    if (!order) {
      throw new NotFoundException('Commande introuvable');
    }

    // Mise à jour du statut
    order.status = dto.status;

    // Sauvegarde de la commande
    const updatedOrder = await this.orderRepo.save(order);

    // Envoi de l'email uniquement si la commande est validée
    if (dto.status === OrderStatus.VALIDATED) {
      await this.mailService.sendHtmlEmailValidation(
        order.user.email,
        'Votre commande a été validée',
        'order-validation.html',
        {
          order,
          user: order.user,
          year: new Date().getFullYear(),
        },
      );
    }
    return updatedOrder;
  }
  async getOrdersByUser(userId: string): Promise<OrderEntity[]> {
    return this.orderRepo.find({
      where: { user: { id: userId } },
      relations: [
       'orderItems.product',
        'orderItems.product.category',
        'orderItems.product.measure',
        'subOrders',
        'subOrders.items.product',
        'subOrders.items.product.category',
        'subOrders.items.product.measure',
        'subOrders.company',
        'user',
        'addressUser',
      ],
      order: {
        createdAt: 'DESC',
      },
    });
  }
  async findByType(
    type?: string,
  ): Promise<{ message: string; data: OrderEntity[] }> {
    const query = this.orderRepo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.user', 'user')
      .leftJoinAndSelect('order.orderItems', 'orderItem')
      .leftJoinAndSelect('orderItem.product', 'product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.measure', 'measure')
      .leftJoinAndSelect('order.subOrders', 'subOrder')
      .leftJoinAndSelect('subOrder.items', 'subOrderItem')
      .leftJoinAndSelect('subOrderItem.product', 'subOrderProduct')
      .leftJoinAndSelect('subOrderProduct.category', 'subOrderCategory')
      .leftJoinAndSelect('subOrderProduct.measure', 'subOrderMeasure')
      .orderBy('order.createdAt', 'DESC');

    if (type) {
      query.where('order.type = :type', { type });
    }

    const orders = await query.getMany();

    if (!orders.length) {
      throw new NotFoundException(
        `Aucune commande trouvée pour le type : ${type}`,
      );
    }

    return {
      message: `Commandes récupérées avec succès pour le type : ${type ?? 'tous'}.`,
      data: orders,
    };
  }

  async findOne(orderId: string): Promise<{ data: OrderEntity }> {
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: [
       'orderItems.product',
        'orderItems.product.category',
        'orderItems.product.measure',
        'subOrders',
        'subOrders.items.product',
        'subOrders.items.product.category',
        'subOrders.items.product.measure',
        'subOrders.company',
        'user',
        'addressUser',
      ],
    });

    if (!order) {
      throw new NotFoundException(`Commande avec l’ID ${orderId} introuvable.`);
    }

    return { data: order };
  }

  async findAll(): Promise<{ data: OrderEntity[] }> {
    const orders = await this.orderRepo.find({
      relations: [
        'orderItems.product',
        'orderItems.product.category',
        'orderItems.product.measure',
        'subOrders',
        'subOrders.items.product',
        'subOrders.items.product.category',
        'subOrders.items.product.measure',
        'subOrders.company',
        'user',
        'addressUser',
      ],
      order: { createdAt: 'DESC' },
    });

    return { data: orders };
  }
}
