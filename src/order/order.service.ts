// order.service.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
import { In } from 'typeorm';
import { SmsHelper } from 'src/users/utility/helpers/sms.helper';

function isValidStatusTransition(current: OrderStatus, next: OrderStatus): boolean {
  const transitions: Record<OrderStatus, OrderStatus[]> = {
    [OrderStatus.PENDING]: [OrderStatus.VALIDATED, OrderStatus.REJECTED],
    [OrderStatus.VALIDATED]: [OrderStatus.PROCESSING, OrderStatus.REJECTED],
    [OrderStatus.PROCESSING]: [OrderStatus.COMPLETED],
    [OrderStatus.COMPLETED]: [OrderStatus.DELIVERED],
    [OrderStatus.DELIVERED]: [],
    [OrderStatus.REJECTED]: [],
  };
  return transitions[current]?.includes(next);
}

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

    private readonly smsHelper: SmsHelper,
  ) {}
  private generatePin(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async createOrder(createOrderDto: CreateOrderDto, user: UserEntity): Promise<OrderEntity> {
    const { totalAmount, shippingCost, currency, orderItems, addressUserId, type, shopType } =
      createOrderDto;

    const addressUser = await this.addressUserRepo.findOne({ where: { id: addressUserId } });
    if (!addressUser) throw new NotFoundException('Adresse introuvable');

    if (
      shopType === CompanyActivity.WHOLESALER ||
      shopType === CompanyActivity.WHOLESALER_RETAILER
    ) {
      for (const item of orderItems) {
        const product = await this.productRepo.findOne({
          where: { id: item.productId },
        });
        if (!product) throw new NotFoundException(`Produit introuvable : ${item.productId}`);

        if (!product.min_quantity) {
          throw new BadRequestException(
            `Le produit "${product.name}" doit avoir une quantité minimale définie pour l'achat en gros.`,
          );
        }

        if (item.quantity < product.min_quantity) {
          throw new BadRequestException(
            `Pour acheter en gros, la quantité minimale pour le produit "${product.name}" est de ${product.min_quantity} unités.`,
          );
        }
      }
    }

    const grandTotal = Number(totalAmount) + Number(shippingCost);
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
      if (!product) throw new NotFoundException(`Produit introuvable : ${item.productId}`);

      const orderItem = this.orderItemRepo.create({
        order,
        product,
        quantity: item.quantity,
        price: item.price,
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
        price: item.price,
      });

      group.items.push(subOrderItem);
      group.total += item.price * item.quantity;
    }

    await this.orderItemRepo.save(orderItemEntities);

    // ✅ Étape 5 : Création des subOrders
    for (const [, group] of groupedByCompany) {
      const subOrder = this.subOrderRepo.create({
        order,
        company: { id: group.companyId } as any,
        totalAmount: group.total,
      });

      await this.subOrderRepo.save(subOrder);
      subOrder.invoiceNumber = invoiceNumb;
      await this.subOrderRepo.save(subOrder);

      for (const item of group.items) {
        item.subOrder = subOrder;
      }
      await this.subOrderItemRepo.save(group.items);
    }

    // ✅ Étape 6 : Récupération de la commande finale
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

    if (!finalOrder) throw new NotFoundException('Commande introuvable après création');

    const subOrders = await this.subOrderRepo.find({
      where: { order: { id: finalOrder.id } },
      relations: ['company', 'items', 'items.product', 'order'],
    });

    const paymentQrCode = await QRCode.toDataURL(finalOrder.invoiceNumber);
    const hasEmail = user.email && user.email.trim() !== '';
    const hasPhone = user.phone && user.phone.trim() !== '';

    if (!hasEmail && !hasPhone) {
      throw new BadRequestException(
        'Aucun moyen de contact disponible (ni email, ni numéro de téléphone).',
      );
    }
    if (hasEmail) {
      await this.mailService.sendInvoiceWithPdf(user.email, 'Votre facture PDF - FavorHelp', {
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
      });
    }
    if (hasPhone) {
      const message = `Votre commande ${finalOrder.invoiceNumber} a ete creee avec succes sur FavorHelp
Montant total ${finalOrder.grandTotal} ${finalOrder.currency}
Pour le paiement vous pouvez envoyer votre argent via Mobile Money sur +243973760641 ou +243811824573
Merci pour votre confiance votre commande sera traitee des reception du paiement`;

      await this.smsHelper.sendSms(user.phone, message);
    }
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

    // Vérification de la transition
    if (!isValidStatusTransition(order.status, dto.status)) {
      throw new BadRequestException(
        `Transition invalide de "${order.status}" vers "${dto.status}".`,
      );
    }

    // Application des changements
    order.status = dto.status;

    // Si la commande est validée
    if (dto.status === OrderStatus.VALIDATED) {
      // Marquer comme payée
      order.paymentStatus = PaymentStatus.PAID;
      order.paid = true;

      // Générer un PIN
      order.pin = this.generatePin();
    }

    const updatedOrder = await this.orderRepo.save(order);

    const subOrders = await this.subOrderRepo.find({
      where: { order: { id: updatedOrder.id } },
      relations: ['company', 'items', 'items.product', 'order'],
    });

    if (dto.status === OrderStatus.VALIDATED) {
      const paymentQrCode = await QRCode.toDataURL(order.invoiceNumber);
      const hasEmail = order.user.email && order.user.email.trim() !== '';
      const hasPhone = order.user.phone && order.user.phone.trim() !== '';

      if (!hasEmail && !hasPhone) {
        throw new BadRequestException(
          'Aucun moyen de contact disponible (ni email, ni numéro de téléphone).',
        );
      }
      if (hasEmail) {
        await this.mailService.sendHtmlEmail(
          order.user.email,
          'Votre code PIN pour la commande FavorHelp',
          'sendPin.html',
          {
            pinCode: updatedOrder.pin,
            invoiceNumber: updatedOrder.invoiceNumber,
            user: order.user,
            subOrders,
            order: updatedOrder,
            year: new Date().getFullYear(),
          } as any,
        );
        await this.mailService.sendInvoicePaidWithPdf(
          order.user.email,
          'Veuillez trouver ci-joint votre facture PDF, déjà payée et validée - FavorHelp',
          {
            user: order.user,
            order: updatedOrder,
            subOrders,
            paymentQrCode,
          },
        );
      }
      if (hasPhone) {
       const message = `Votre commande ${updatedOrder.invoiceNumber} a ete validee avec succes
Pour recuperer votre commande ou colis veuillez presenter ce code PIN au livreur : ${updatedOrder.pin}
Merci pour votre confiance votre commande sera traitee des reception du paiement`;
        await this.smsHelper.sendSms(updatedOrder.user.phone, message);
      }

      const createTransactionDto: CreateTransactionDto = {
        orderId: updatedOrder.id,
        amount: updatedOrder.totalAmount,
        paymentStatus: PaymentStatus.PAID,
        transactionReference: uuidv4(),
        currency: 'USD',
        type: TransactionType.CREDIT,
      };

      const transaction = this.transactionRepository.create(createTransactionDto);
      await this.transactionRepository.save(transaction);
    }

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
      throw new NotFoundException('Commande introuvable avec ce numéro de facture.');
    }

    const subOrders = await this.subOrderRepo.find({
      where: { order: { id: order.id } },
      relations: ['company', 'items', 'items.product', 'order'],
    });

    const paymentQrCode = await QRCode.toDataURL(order.invoiceNumber);

    const pdfBuffer = await this.mailService.generatePdfFromTemplate('invoice.ejs', {
      user: order.user,
      order,
      subOrders,
      paymentQrCode,
      subOrdersHtml: this.mailService.generateSubOrdersByInvoiceNumberHtml(
        subOrders,
        order.currency,
      ),
    });

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

  async findByType(type?: string): Promise<{ message: string; data: OrderEntity[] }> {
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

  async findSubOrdersByCompanys(companyId: string): Promise<{ data: SubOrderEntity[] }> {
    const orders = await this.orderRepo.find({
      relations: [
        'user', // ✅ Relation directe avec OrderEntity
        'addressUser', // ✅ Relation directe avec OrderEntity
        'subOrders',
        'subOrders.items.product.company',
        'subOrders.items.product.category',
        'subOrders.items.product.measure',
        'subOrders.company',
      ],
      order: { createdAt: 'DESC' },
    });

    // Récupération et filtrage des subOrders
    const subOrders: SubOrderEntity[] = orders
      .flatMap((order) =>
        order.subOrders.map((sub) => ({
          ...sub,
          user: order.user, // ✅ on rattache le client à la sous-commande
          addressUser: order.addressUser, // ✅ on rattache l'adresse client à la sous-commande
        })),
      )
      .filter((sub) => sub.company.id === companyId);

    return { data: subOrders };
  }
}
