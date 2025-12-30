// order.service.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
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
import { NotificationsService } from 'src/notification/notifications.service';
import { UserPlatformRoleEntity } from 'src/users/entities/user_plateform_roles.entity';
import { UserRole } from 'src/users/enum/user-role-enum';
import { CompanyType } from 'src/company/enum/type.company.enum';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { GeneratePin } from 'src/users/utility/helpers/GeneratePin.util';

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

    @InjectRepository(CompanyEntity)
    private readonly companyRepo: Repository<CompanyEntity>,

    @InjectRepository(AddressUser)
    private readonly addressUserRepo: Repository<AddressUser>,

    private readonly mailService: MailOrderService,
    private readonly pdfService: PdfService,

    private readonly invoiceService: InvoiceService,

    @InjectRepository(TransactionEntity)
    private readonly transactionRepository: Repository<TransactionEntity>,

    @InjectRepository(UserPlatformRoleEntity)
    private readonly userPlatformRoleRepo: Repository<UserPlatformRoleEntity>,

    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,

    private readonly notificationsService: NotificationsService,

    private readonly smsHelper: SmsHelper,
  ) {}

  async createOrder(createOrderDto: CreateOrderDto, user: UserEntity): Promise<OrderEntity> {
    const { totalAmount, currency, orderItems, addressUserId, type, shopType } = createOrderDto;

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

    const grandTotal = Number(totalAmount);
    const invoiceNumb = this.invoiceService.generateInvoiceNumber();

    const order = this.orderRepo.create({
      user,
      totalAmount,
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
      const message = `Votre commande ${finalOrder.invoiceNumber} a été créée avec succès sur FavorHelp.
Montant total : ${finalOrder.grandTotal} ${finalOrder.currency}.
Pour le paiement, vous pouvez faire un retrait sur ce numéro agent via Mobile Money : +243 962 646 653 (Nom affiché : Kavira Naomi).
Vous pouvez également effectuer un dépôt sur notre compte bancaire Equity : 688200060761632.
Pour vérifier votre facture, veuillez consulter la section "Commandes" afin de mieux la visualiser.
Merci pour votre confiance. Votre commande sera traitée dès la réception du paiement.`;

      await this.smsHelper.sendSms(user.phone, message);
    }

    //  Récupérer les utilisateurs liés à la plateforme
    const platformUsers = await this.userPlatformRoleRepo.find({
      where: { platform: { key: order.type } },
      relations: ['user'],
    });

    // 🔹 Récupérer les super administrateurs
    const superAdmins = await this.userRepository.find({
      where: { role: UserRole.SUPER_ADMIN },
    });

    // 🔹 Fusionner les destinataires et éviter les doublons (basé sur l'id utilisateur)
    const allRecipients = [...platformUsers.map((p) => p.user), ...superAdmins].filter(
      (user, index, self) => index === self.findIndex((u) => u.id === user.id),
    );

    // 🔹 Envoyer la notification à tous les destinataires
    for (const user of allRecipients) {
      await this.notificationsService.sendNotificationToUser(
        user.id,
        'Nouvelle commande reçue',
        `Une nouvelle commande (${finalOrder.invoiceNumber}) vient d'être créée.`,
        order.type as any,
        finalOrder,
      );
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

    if (!order) throw new NotFoundException('Commande introuvable');

    // Vérifie la validité de la transition de statut
    if (!isValidStatusTransition(order.status, dto.status)) {
      throw new BadRequestException(
        `Transition invalide de "${order.status}" vers "${dto.status}".`,
      );
    }

    // Validation shippingCost
    if (
      [OrderStatus.PROCESSING, OrderStatus.COMPLETED, OrderStatus.DELIVERED].includes(
        dto.status,
      )
    ) {
      dto.shippingCost = order.shippingCost;
    }

    if (dto.status === OrderStatus.VALIDATED) {
      if (dto.shippingCost === undefined || dto.shippingCost === null) {
        throw new BadRequestException(
          'Le coût de livraison (shippingCost) est obligatoire lorsque le statut est VALIDATED.',
        );
      }
      order.shippingCost = dto.shippingCost;
      order.grandTotal = Number(order.totalAmount) + Number(dto.shippingCost);
    } else if (dto.shippingCost !== undefined) {
      order.shippingCost = dto.shippingCost;
      order.grandTotal = Number(order.totalAmount) + Number(dto.shippingCost);
    }

    // Application du nouveau statut à la commande principale
    order.status = dto.status;

    // ✅ Mettre à jour les sous-commandes si nécessaire
    if (order.subOrders?.length) {
      for (const subOrder of order.subOrders) {
        if (!isValidStatusTransition(subOrder.status, dto.status)) {
          throw new BadRequestException(
            `Impossible de passer la sous-commande ${subOrder.id} de "${subOrder.status}" à "${dto.status}".`,
          );
        }
        subOrder.status = dto.status;
        await this.subOrderRepo.save(subOrder);
      }
    }

    if (dto.status === OrderStatus.VALIDATED) {
      order.paymentStatus = PaymentStatus.PAID;
      order.paid = true;
      order.pin = GeneratePin.generate();

      const subOrders = order.subOrders;

      const paymentQrCode = await QRCode.toDataURL(order.invoiceNumber);
      const hasEmail = order.user.email?.trim();
      const hasPhone = order.user.phone?.trim();

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
            pinCode: order.pin,
            invoiceNumber: order.invoiceNumber,
            user: order.user,
            subOrders,
            order: order,
            year: new Date().getFullYear(),
          } as any,
        );

        await this.mailService.sendInvoicePaidWithPdf(
          order.user.email,
          'Veuillez trouver ci-joint votre facture PDF, déjà payée et validée - FavorHelp',
          {
            user: order.user,
            order: order,
            subOrders,
            paymentQrCode,
          },
        );
      }

      if (hasPhone) {
        const message = `Votre commande/colis ${order.invoiceNumber} a été validé avec succès. Livraison: ${order.shippingCost} ${order.currency}. Présentez votre code PIN au livreur: ${order.pin}. Merci pour votre confiance - FavorHelp`;

        await this.smsHelper.sendSms(order.user.phone, message);
      }
      // Créer la transaction
      const transaction = this.transactionRepository.create({
        orderId: order.id,
        amount: order.totalAmount,
        paymentStatus: PaymentStatus.PAID,
        transactionReference: uuidv4(),
        currency: 'USD',
        type: TransactionType.CREDIT,
      });
      await this.transactionRepository.save(transaction);
    }

    const updatedOrder = await this.orderRepo.save(order);

    return {
      message: `La commande ${orderId} et ses sous-commandes ont été mises à jour avec succès.`,
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

  // async getDashboardData(
  //   type: CompanyType | 'ALL',
  //   dateDebut: Date,
  //   dateFin: Date,
  // ): Promise<{
  //   message: string;
  //   data: {
  //     totalOrders: number;
  //     totalSales: number;
  //     totalRevenue: number;
  //     totalShippingFees: number;
  //     totalProducts: number;
  //     totalUsers: number;
  //     totalCompanies: number;
  //     ordersByDay: any[];
  //     revenueByDay: any[];
  //     topProducts: any[];
  //   };
  // }> {

  //   dateFin.setDate(dateFin.getDate() + 1);

  //   const whereType = type && type !== 'ALL' ? 'order.type = :type' : '1=1';

  //   const orders = await this.orderRepo
  //     .createQueryBuilder('order')
  //     .where(whereType, { type })
  //     .andWhere('order.createdAt BETWEEN :start AND :end', {
  //       start: dateDebut,
  //       end: dateFin,
  //     })
  //     .getMany();

  //   const totalOrders = orders.length;
  //   const deliveredOrders = orders.filter((o) => o.status === OrderStatus.DELIVERED);
  //   const totalSales = deliveredOrders.length;
  //   const totalRevenue = orders.reduce((acc, o) => acc + Number(o.totalAmount || 0), 0);
  //   const totalShippingFees = orders.reduce((acc, o) => acc + Number(o.shippingCost || 0), 0);

  //   const ordersByDay = await this.orderRepo
  //     .createQueryBuilder('order')
  //     .select('DATE(order.createdAt)', 'date')
  //     .addSelect('COUNT(order.id)', 'count')
  //     .addSelect('SUM(order.totalAmount)', 'amount')
  //     .where(whereType, { type })
  //     .andWhere('order.createdAt BETWEEN :start AND :end', {
  //       start: dateDebut,
  //       end: dateFin,
  //     })
  //     .groupBy('DATE(order.createdAt)')
  //     .orderBy('DATE(order.createdAt)', 'ASC')
  //     .getRawMany();

  //   const revenueByDay = await this.orderRepo
  //     .createQueryBuilder('order')
  //     .select('DATE(order.createdAt)', 'date')
  //     .addSelect('SUM(order.totalAmount)', 'revenue')
  //     .addSelect('SUM(order.shippingCost)', 'shipping')
  //     .where(whereType, { type })
  //     .andWhere('order.createdAt BETWEEN :start AND :end', {
  //       start: dateDebut,
  //       end: dateFin,
  //     })
  //     .groupBy('DATE(order.createdAt)')
  //     .orderBy('DATE(order.createdAt)', 'ASC')
  //     .getRawMany();

  //   const topProducts = await this.orderItemRepo
  //     .createQueryBuilder('oi')
  //     .innerJoin('oi.product', 'product')
  //     .innerJoin('oi.order', 'order')
  //     .select('product.name', 'name')
  //     .addSelect('SUM(oi.quantity)', 'count')
  //     .addSelect('SUM(oi.quantity * oi.price)', 'amount')
  //     .where(whereType, { type })
  //     .andWhere('order.createdAt BETWEEN :start AND :end', {
  //       start: dateDebut,
  //       end: dateFin,
  //     })
  //     .groupBy('product.id')
  //     .orderBy('count', 'DESC')
  //     .limit(10)
  //     .getRawMany();

  //   const [totalProducts, totalUsers, totalCompanies] = await Promise.all([
  //     this.productRepo.count(),
  //     this.userRepository.count(),
  //     this.companyRepo.count(),
  //   ]);

  //   return {
  //     message: 'Dashboard data fetched successfully',
  //     data: {
  //       totalOrders,
  //       totalSales,
  //       totalRevenue,
  //       totalShippingFees,
  //       totalProducts,
  //       totalUsers,
  //       totalCompanies,
  //       ordersByDay,
  //       revenueByDay,
  //       topProducts,
  //     },
  //   };
  // }

  async getDashboardData(
    type: CompanyType | 'ALL',
    dateDebut: Date,
    dateFin: Date,
  ): Promise<{
    message: string;
    data: {
      totalOrders: number;
      totalSales: number;
      totalRevenue: number;
      totalShippingFees: number;
      totalProducts: number;
      totalUsers: number;
      totalCompanies: number;
      ordersByDay: any[];
      revenueByDay: any[];
      topProducts: any[];
    };
  }> {
    // Ajouter un jour à la date de fin
    const adjustedDateFin = new Date(dateFin);
    adjustedDateFin.setDate(adjustedDateFin.getDate() + 1);

    // Construction des conditions WHERE
    const whereConditions: string[] = [];
    const whereParams: any = {
      start: dateDebut,
      end: adjustedDateFin,
    };

    // Base condition pour la date
    whereConditions.push('order.createdAt BETWEEN :start AND :end');

    // Filtre par type de company (directement depuis le champ type de OrderEntity)
    if (type && type !== 'ALL') {
      whereConditions.push('order.type = :type');
      whereParams.type = type;
    }

    // Joindre les conditions
    const whereClause = whereConditions.join(' AND ');

    // 1. Récupérer les commandes avec les filtres
    const orders = await this.orderRepo
      .createQueryBuilder('order')
      .where(whereClause, whereParams)
      .getMany();

    // Calculs basés sur les commandes
    const totalOrders = orders.length;
    const deliveredOrders = orders.filter((o) => o.status === OrderStatus.DELIVERED);
    const totalSales = deliveredOrders.length;
    const totalRevenue = orders.reduce((acc, o) => acc + Number(o.totalAmount || 0), 0);
    const totalShippingFees = orders.reduce((acc, o) => acc + Number(o.shippingCost || 0), 0);

    // 2. Commandes par jour
    const ordersByDay = await this.orderRepo
      .createQueryBuilder('order')
      .select('DATE(order.createdAt)', 'date')
      .addSelect('COUNT(order.id)', 'count')
      .addSelect('SUM(order.totalAmount)', 'amount')
      .where(whereClause, whereParams)
      .groupBy('DATE(order.createdAt)')
      .orderBy('DATE(order.createdAt)', 'ASC')
      .getRawMany();

    // 3. Revenus par jour
    const revenueByDay = await this.orderRepo
      .createQueryBuilder('order')
      .select('DATE(order.createdAt)', 'date')
      .addSelect('SUM(order.totalAmount)', 'revenue')
      .addSelect('SUM(order.shippingCost)', 'shipping')
      .where(whereClause, whereParams)
      .groupBy('DATE(order.createdAt)')
      .orderBy('DATE(order.createdAt)', 'ASC')
      .getRawMany();

    // 4. Top produits avec filtres
    // Note: Vous devez vérifier si OrderItemEntity a une relation avec OrderEntity
    const topProductsQueryBuilder = this.orderItemRepo
      .createQueryBuilder('oi')
      .innerJoin('oi.product', 'product')
      .innerJoin('oi.order', 'order')
      .select('product.name', 'name')
      .addSelect('product.id', 'productId')
      .addSelect('SUM(oi.quantity)', 'count')
      .addSelect('SUM(oi.quantity * oi.price)', 'amount')
      .where('order.createdAt BETWEEN :start AND :end', {
        start: dateDebut,
        end: adjustedDateFin,
      });

    // Ajouter le filtre par type si nécessaire
    if (type && type !== 'ALL') {
      topProductsQueryBuilder.andWhere('order.type = :type', { type });
    }

    const topProducts = await topProductsQueryBuilder
      .groupBy('product.id, product.name')
      .orderBy('count', 'DESC')
      .limit(10)
      .getRawMany();

    // 5. Total produits
    // Si les produits sont liés à des companies, filtrez par type de company
    const totalProductsQueryBuilder = this.productRepo
      .createQueryBuilder('product')
      .select('COUNT(product.id)', 'count');

    if (type && type !== 'ALL') {
      // Si Product a une relation avec Company
      totalProductsQueryBuilder
        .innerJoin('product.company', 'company')
        .where('company.typeCompany = :type', { type });
    }

    // Ajouter le filtre par date si les produits ont une date de création
    totalProductsQueryBuilder.andWhere('product.createdAt BETWEEN :start AND :end', {
      start: dateDebut,
      end: adjustedDateFin,
    });

    const totalProductsResult = await totalProductsQueryBuilder.getRawOne();
    const totalProducts = parseInt(totalProductsResult?.count || 0);

    // 6. Total utilisateurs (filtrés par date d'inscription)
    const totalUsers = await this.userRepository.count({
      where: {
        createdAt: Between(dateDebut, adjustedDateFin),
      },
    });

    // 7. Total companies avec filtres par type et date
    const totalCompaniesWhere: any = {
      createdAt: Between(dateDebut, adjustedDateFin),
    };

    if (type && type !== 'ALL') {
      totalCompaniesWhere.typeCompany = type;
    }

    const totalCompanies = await this.companyRepo.count({
      where: totalCompaniesWhere,
    });

    return {
      message: 'Dashboard data fetched successfully',
      data: {
        totalOrders,
        totalSales,
        totalRevenue,
        totalShippingFees,
        totalProducts,
        totalUsers,
        totalCompanies,
        ordersByDay,
        revenueByDay,
        topProducts,
      },
    };
  }
}
