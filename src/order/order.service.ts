// order.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
import { MailOrderService } from 'src/email/emailorder.service';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrderStatus } from 'src/order/enum/order.status.enum';
import { CompanyActivity } from 'src/company/enum/activity.company.enum';
import { PaymentStatus } from 'src/transaction/enum/payment.status.enum';
import { PdfService } from 'src/pdf/pdf.service';
import { TransactionEntity } from 'src/transaction/entities/transaction.entity';
import { v4 as uuidv4 } from 'uuid';
import { CreateTransactionDto } from 'src/transaction/dto/create-transaction.dto';
import { TransactionType } from 'src/transaction/transaction.enum';
import { InvoiceService } from './invoice/invoice.util';
import * as QRCode from 'qrcode';

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

    @InjectRepository(TransactionEntity)
    private readonly transactionRepository: Repository<TransactionEntity>,
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

      const orderItem = this.orderItemRepo.create({
        order,
        product,
        quantity: item.quantity,
        price: item.price, // on utilise selectedPrice ici pour cohérence
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
        price: item.price, // idem ici
      });

      group.items.push(subOrderItem);
      group.total += item.price * item.quantity;
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
        'orderItems.product.company',
        'orderItems.product.category',
        'orderItems.product.measure',
        'subOrders',
        'subOrders.items.product.company',
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

    const paymentQrCode = await QRCode.toDataURL(finalOrder.invoiceNumber);

    await this.mailService.sendInvoiceWithPdf(
      user.email,
      'Votre facture PDF - FavorHelp',
      {
        user,
        order: {
          id: finalOrder.id,
          totalAmount: finalOrder.totalAmount,
          currency: finalOrder.currency,
          invoiceNumber: finalOrder.invoiceNumber,
          address: finalOrder.addressUser.address,
          paymentStatus: order.paymentStatus,
        },
        subOrders,
        paymentQrCode,
      },
    );

    return finalOrder;
  }

  async updateOrderStatus(
    orderId: string,
    dto: UpdateOrderStatusDto,
  ): Promise<{ data: OrderEntity; message: string }> {
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: [
        'orderItems.product.company',
        'orderItems.product.category',
        'orderItems.product.measure',
        'subOrders',
        'subOrders.items.product.company',
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
    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException(
        'Cette commande est déjà validée ou fermée et ne peut plus être modifiée.',
      );
    }
    order.status = dto.status;
    order.paymentStatus = PaymentStatus.PAID;
    order.paid = true;

    // Sauvegarde de la commande
    const updatedOrder = await this.orderRepo.save(order);

    const subOrders = await this.subOrderRepo.find({
      where: { order: { id: updatedOrder.id } },
      relations: ['company', 'items', 'items.product', 'order'],
    });
    // Si le statut de la commande est validé, envoi de l'email
    if (dto.status === OrderStatus.VALIDATED) {
      const paymentQrCode = await QRCode.toDataURL(order.invoiceNumber);
      await this.mailService.sendInvoicePaidWithPdf(
        order.user.email,
        'Veuillez trouver ci-joint votre facture PDF, déjà payée et validée - FavorHelp',
        {
          user: order.user,
          order,
          subOrders,
          paymentQrCode,
        },
      );

      const createTransactionDto: CreateTransactionDto = {
        orderId: updatedOrder.id,
        amount: updatedOrder.totalAmount,
        paymentStatus: PaymentStatus.PAID, // Statut de paiement initial
        transactionReference: uuidv4(), // Générer une référence unique
        currency: 'USD', // Exemple de devise, à ajuster selon la commande
        type: TransactionType.CREDIT,
      };

      // Créer l'entité de transaction à partir du DTO
      const transaction =
        this.transactionRepository.create(createTransactionDto);
      await this.transactionRepository.save(transaction);
      // Sauvegarder la transaction dans la base de données
    }
    // Retourner le message et la commande mise à jour
    return {
      message: `La commande ${orderId} a été mise à jour avec succès.`,
      data: updatedOrder,
    };
  }

  async generateInvoiceByInvoiceNumber(
    invoiceNumber: string,
  ): Promise<{ pdfBuffer: Buffer; message: string }> {
    const order = await this.orderRepo.findOne({
      where: { invoiceNumber },
      relations: [
        'orderItems.product.company',
        'orderItems.product.category',
        'orderItems.product.measure',
        'subOrders',
        'subOrders.items.product.company',
        'subOrders.items.product.category',
        'subOrders.items.product.measure',
        'subOrders.company',
        'user',
        'addressUser',
      ],
    });

    if (!order) {
      throw new NotFoundException(
        'Commande introuvable avec ce numéro de facture.',
      );
    }

    const subOrders = await this.subOrderRepo.find({
      where: { order: { id: order.id } },
      relations: ['company', 'items', 'items.product', 'order'],
    });

    const paymentQrCode = await QRCode.toDataURL(order.invoiceNumber);

    const pdfBuffer = await this.mailService.generatePdfFromTemplate(
      'invoice.ejs',
      {
        user: order.user,
        order,
        subOrders,
        paymentQrCode,
        subOrdersHtml: this.mailService.generateSubOrdersByInvoiceNumberHtml(
          subOrders,
          order.currency,
        ),
      },
    );

    return {
      pdfBuffer,
      message: 'Facture générée avec succès',
    };
  }
  async getAllTransctions(): Promise<{ data: TransactionEntity[] }> {
    const transactions = await this.transactionRepository.find({
      relations: ['order', 'order.user'],
    });

    return { data: transactions };
  }

  async getTransactionsByUser(
    userId: string,
  ): Promise<{ data: TransactionEntity[]; message: string }> {
    const transactions = await this.transactionRepository.find({
      where: {
        order: {
          user: { id: userId },
        },
      },
      relations: ['order', 'order.user'],
      order: { createdAt: 'DESC' }, // Pour trier par date la plus récente
    });

    return {
      data: transactions,
      message: transactions.length
        ? `Transactions de l'utilisateur ${userId} récupérées avec succès.`
        : `Aucune transaction trouvée pour l'utilisateur ${userId}.`,
    };
  }

  async getOrdersByUser(userId: string): Promise<OrderEntity[]> {
    return this.orderRepo.find({
      where: { user: { id: userId } },
      relations: [
        'orderItems.product.company',
        'orderItems.product.category',
        'orderItems.product.measure',
        'subOrders',
        'subOrders.items.product.company',
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
      .leftJoinAndSelect('order.addressUser', 'addressUser')
      .leftJoinAndSelect('order.orderItems', 'orderItem')
      .leftJoinAndSelect('orderItem.product', 'product')
      .leftJoinAndSelect('product.company', 'productCompany')
      .leftJoinAndSelect('product.category', 'productCategory')
      .leftJoinAndSelect('product.measure', 'productMeasure')
      .leftJoinAndSelect('order.subOrders', 'subOrder')
      .leftJoinAndSelect('subOrder.items', 'subOrderItem')
      .leftJoinAndSelect('subOrderItem.product', 'subOrderProduct')
      .leftJoinAndSelect('subOrderProduct.company', 'subOrderProductCompany')
      .leftJoinAndSelect('subOrderProduct.category', 'subOrderProductCategory')
      .leftJoinAndSelect('subOrderProduct.measure', 'subOrderProductMeasure')
      .leftJoinAndSelect('subOrder.company', 'subOrderCompany')
      .orderBy('order.createdAt', 'DESC');
    if (type) {
      query.where('order.type = :type', { type });
    }

    const orders = await query.getMany();

    return {
      message: `Commandes récupérées avec succès pour le type : ${type ?? 'tous'}.`,
      data: orders,
    };
  }

  async findOne(orderId: string): Promise<{ data: OrderEntity }> {
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: [
        'orderItems.product.company',
        'orderItems.product.category',
        'orderItems.product.measure',
        'subOrders',
        'subOrders.items.product.company',
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
        'orderItems.product.company',
        'orderItems.product.category',
        'orderItems.product.measure',
        'subOrders',
        'subOrders.items.product.company',
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

  async findSubOrdersByCompanys(
    companyId: string,
  ): Promise<{ data: SubOrderEntity[] }> {
    const orders = await this.orderRepo.find({
      relations: [
        'subOrders',
        'subOrders.items.product.company',
        'subOrders.items.product.category',
        'subOrders.items.product.measure',
        'subOrders.company',
      ],
      order: { createdAt: 'DESC' },
    });

    const subOrders: SubOrderEntity[] = orders
      .flatMap((order) => order.subOrders)
      .filter((sub) => sub.company.id === companyId);

    return { data: subOrders };
  }
}
