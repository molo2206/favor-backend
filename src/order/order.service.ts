/* eslint-disable @typescript-eslint/no-unused-vars */
import { OrderNotificationHelper } from 'src/notification/utils/order-notification.helper';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
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
import { TransactionType } from 'src/transaction/enum/transaction.enum';
import { InvoiceService } from './invoice/invoice.util';
import * as QRCode from 'qrcode';
import { SmsHelper } from 'src/users/utility/helpers/sms.helper';
import { NotificationsService } from 'src/notification/notifications.service';
import { UserPlatformRoleEntity } from 'src/users/entities/user_plateform_roles.entity';
import { UserRole } from 'src/users/enum/user-role-enum';
import { CompanyType } from 'src/company/enum/type.company.enum';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { GeneratePin } from 'src/users/utility/helpers/GeneratePin.util';
import { PawapayService } from 'src/pawapay/pawapay.service';
import { UserHasCompanyEntity } from 'src/user_has_company/entities/user_has_company.entity';
import { PaginatedResponseDto } from './dto/paginated-response.dto';
import { PaymentMethod } from 'src/operation/enum/payment-method.enum';
import { OperationEntity } from 'src/operation/entity/operation.entity';
import { OperationStatus } from 'src/operation/enum/operation.status.enum';
import { PushNotificationHelper } from 'src/users/utility/helpers/push-notification.helper';
import { NotificationType } from 'src/notification/type/notification.type';
import { NotificationHelper } from 'src/notification/utils/notification.helper';
import { PermissionHelper } from 'src/users/utility/helpers/permission.helper';
import { I18nService } from 'src/libs/common/src';
import { CancelOrderDto } from './dto/create-cancel-order.dto';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { CompanyHasUserResource } from 'src/company_has_usrResource/entities/company_has_userResource.entity';
import { City } from 'src/company/entities/city.entity';
import { FpayService } from 'src/fpay/fpay.service';
import { randomBytes } from 'crypto';
import { PayOrderDto } from './dto/pay-order.dto';

function isValidStatusTransition(current: OrderStatus, next: OrderStatus): boolean {
  const transitions: Record<OrderStatus, OrderStatus[]> = {
    [OrderStatus.PENDING]: [OrderStatus.VALIDATED, OrderStatus.REJECTED],
    [OrderStatus.VALIDATED]: [OrderStatus.PROCESSING],
    [OrderStatus.PROCESSING]: [OrderStatus.COMPLETED],
    [OrderStatus.COMPLETED]: [OrderStatus.DELIVERED],
    [OrderStatus.DELIVERED]: [],
    [OrderStatus.REJECTED]: [],
  };
  return transitions[current]?.includes(next) ?? false;
}

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(OrderEntity) private readonly orderRepo: Repository<OrderEntity>,
    @InjectRepository(OrderItemEntity) private readonly orderItemRepo: Repository<OrderItemEntity>,
    @InjectRepository(SubOrderEntity) private readonly subOrderRepo: Repository<SubOrderEntity>,
    @InjectRepository(SubOrderItemEntity) private readonly subOrderItemRepo: Repository<SubOrderItemEntity>,
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectRepository(CompanyEntity) private readonly companyRepo: Repository<CompanyEntity>,
    @InjectRepository(AddressUser) private readonly addressUserRepo: Repository<AddressUser>,
    @InjectRepository(BranchEntity) private readonly branchRepo: Repository<BranchEntity>,
    @InjectRepository(City) private readonly cityRepo: Repository<City>,

    private readonly mailService: MailOrderService,
    private readonly pdfService: PdfService,
    private readonly invoiceService: InvoiceService,
    @InjectRepository(TransactionEntity) private readonly transactionRepository: Repository<TransactionEntity>,
    @InjectRepository(UserPlatformRoleEntity) private readonly userPlatformRoleRepo: Repository<UserPlatformRoleEntity>,
    @InjectRepository(UserEntity) private readonly userRepository: Repository<UserEntity>,
    private readonly smsHelper: SmsHelper,
    private readonly pawapayService: PawapayService,
    @InjectRepository(UserHasCompanyEntity) private readonly userHasCompanyRepo: Repository<UserHasCompanyEntity>,
    private readonly notificationsService: NotificationsService,
    private readonly notificationHelper: OrderNotificationHelper,
    private readonly notificationHelpers: NotificationHelper,
    @InjectRepository(OperationEntity) private readonly operationRepo: Repository<OperationEntity>,
    private readonly pushNotificationHelper: PushNotificationHelper,
    private readonly permissionHelper: PermissionHelper,
    private readonly i18nService: I18nService,
    private readonly fpayService: FpayService,
    @InjectRepository(CompanyHasUserResource) private readonly companyHasUserResourceRepo: Repository<CompanyHasUserResource>,
  ) { }

  private getUserLanguage(user: UserEntity): string {
    const lang = user.settings?.language || 'fr';
    const supported = ['fr', 'en', 'sw', 'es', 'ar'];
    return supported.includes(lang) ? lang : 'fr';
  }

  // ======================== CRÉATION DE COMMANDE ========================
  async createOrder(
    createOrderDto: CreateOrderDto,
    user: UserEntity,
    signal?: AbortSignal,
    langHeader?: string,
  ): Promise<OrderEntity> {
    const {
      totalAmount,
      currency,
      orderItems,
      addressUserId,
      type,
      shopType,
      whatsapp_number,
      provider,
      phone,
      paymentMethod,
      appliedFeeRate,
      grandTotal,
      transactionFee,
      shippingCost,
      pin, // ✅ Ajouté pour FPAY
    } = createOrderDto;

    const lang = langHeader || this.getUserLanguage(user);

    if (signal?.aborted) {
      throw new BadRequestException(this.i18nService.translate('order.order_request_aborted', lang));
    }
    const accessToken = createOrderDto.access_token;
    const hasEmailCurrentUser = user.email && user.email.trim() !== '';
    const hasPhoneCurrentUser = user.phone && user.phone.trim() !== '';
    if (!hasEmailCurrentUser && !hasPhoneCurrentUser) {
      throw new BadRequestException(this.i18nService.translate('order.profile_incomplete', lang));
    }

    const addressUser = await this.addressUserRepo.findOne({ where: { id: addressUserId } });
    if (!addressUser) {
      throw new NotFoundException(this.i18nService.translate('order.address_not_found', lang));
    }

    if (shopType === CompanyActivity.WHOLESALER || shopType === CompanyActivity.WHOLESALER_RETAILER) {
      for (const item of orderItems) {
        const product = await this.productRepo.findOne({ where: { id: item.productId } });
        if (!product) {
          throw new NotFoundException(
            this.i18nService.translate('order.product_not_found', lang, { productId: item.productId }),
          );
        }
        if (!product.min_quantity) {
          throw new BadRequestException(
            this.i18nService.translate('order.wholesale_min_quantity_required', lang, {
              productName: product.name,
            }),
          );
        }
        if (item.quantity < product.min_quantity) {
          throw new BadRequestException(
            this.i18nService.translate('order.wholesale_min_quantity_error', lang, {
              productName: product.name,
              minQuantity: product.min_quantity,
            }),
          );
        }
      }
    }

    const invoiceNumb = this.invoiceService.generateInvoiceNumber();
    let paymentStatus = PaymentStatus.PENDING;
    let orderStatus = OrderStatus.PENDING;
    let isPaidByMobileMoney = false;
    let selectedMethod: PaymentMethod = PaymentMethod.MANUAL;
    let fpayTransactionId: string | null = null; // ✅ Ajouté pour FPAY
    let fpayReference: string | null = null; // ✅ Ajouté pour FPAY

    if (type === CompanyType.RESTAURANT) {
      selectedMethod = paymentMethod || PaymentMethod.MANUAL;
      if (selectedMethod === PaymentMethod.MOBILE_MONEY) {
        if (!provider || !phone) {
          throw new BadRequestException(this.i18nService.translate('order.mobile_money_provider_phone_required', lang));
        }
        const phon = phone.trim();
        if (!phon) {
          throw new BadRequestException(this.i18nService.translate('order.mobile_money_invalid_phone', lang));
        }

        const finalGrandTotal = grandTotal || (totalAmount + (shippingCost || 0));

        // ✅ Vérifier que le montant est valide
        if (!finalGrandTotal || finalGrandTotal <= 0) {
          throw new BadRequestException(
            this.i18nService.translate('order.mobile_money_grandtotal_required', lang)
          );
        }

        const amount = finalGrandTotal.toString();
        const pawapayData = {
          amount: amount,
          currency,
          provider,
          phone: phon
        };
        console.log('[Order] Création dépôt Pawapay :', pawapayData);

        // ============================================================
        // 1. PAIEMENT PRINCIPAL VIA PAWAPAY (OBLIGATOIRE)
        // ============================================================
        try {
          const pawapayResponse = await this.pawapayService.createDepositSimple(pawapayData, signal);
          console.log('[Order] Réponse Pawapay :', JSON.stringify(pawapayResponse, null, 2));

          const depositStatus = pawapayResponse.finalStatus?.data?.status;
          const failureReason = pawapayResponse.finalStatus?.data?.failureReason;

          console.log(`[Order] Statut Pawapay: ${depositStatus}`);

          // ✅ Statuts finaux
          // COMPLETED = Succès définitif
          // REJECTED, FAILED, CANCELED, EXPIRED = Échec définitif

          // ✅ Statuts temporaires (en attente)
          // ACCEPTED, PENDING, PROCESSING, WAITING = La requête est acceptée mais en traitement

          // ✅ Si statut en attente (ACCEPTED, PENDING, etc.)
          if (depositStatus === 'ACCEPTED' || depositStatus === 'PENDING' ||
            depositStatus === 'PROCESSING' || depositStatus === 'WAITING') {
            console.log(`[Order] ⏳ Paiement en cours de traitement: ${depositStatus}`);

            // Le polling va continuer à vérifier le statut
            // On retourne un message indiquant que le paiement est en cours
            throw new BadRequestException(
              `Le paiement est en cours de traitement. Veuillez patienter... Statut: ${depositStatus}`
            );
          }

          // ✅ Si succès
          if (depositStatus === 'COMPLETED') {
            console.log('[Order] ✅ Dépôt Pawapay confirmé : COMPLETED');
            paymentStatus = PaymentStatus.PAID;
            orderStatus = OrderStatus.VALIDATED;
            isPaidByMobileMoney = true;
          }

          // ✅ Si échec définitif
          if (depositStatus === 'REJECTED' || depositStatus === 'FAILED' ||
            depositStatus === 'CANCELED' || depositStatus === 'EXPIRED') {
            console.log(`[Order] ❌ Statut d'erreur: ${depositStatus}`);

            if (failureReason?.failureMessage) {
              throw new BadRequestException(failureReason.failureMessage);
            }

            throw new BadRequestException(`Paiement échoué: ${depositStatus}`);
          }

          // ✅ Si statut inconnu
          console.log(`[Order] ❌ Statut inconnu: ${depositStatus}`);
          throw new BadRequestException(`Statut de paiement inconnu: ${depositStatus}`);

        } catch (error: any) {
          if (error.name === 'AbortError' || signal?.aborted) {
            console.log('[Order] ⚠️ Opération annulée par l\'utilisateur');
            throw new BadRequestException(
              this.i18nService.translate('order.order_request_aborted', lang)
            );
          }

          if (error instanceof BadRequestException) {
            throw error;
          }

          console.error('[Order] Erreur Pawapay:', error.message);
          throw new BadRequestException(
            error.message || this.i18nService.translate('order.payment_failed', lang)
          );
        }

        // ============================================================
        // 2. PAIEMENT OPTIONNEL VIA FPAY (NE BLOQUE JAMAIS)
        // ============================================================
        try {
          const fpayResponse = await this.fpayService.payWithMobileMoney(
            amount as any,
            currency || 'USD',
            `Paiement de commande #${invoiceNumb}`,
            'MOBILE_MONEY',
            lang
          );

          if (fpayResponse?.data?.transaction?.status === 'SUCCESS') {
            // ✅ Mettre à jour les infos FPAY si réussi
            fpayTransactionId = fpayResponse.data.transaction.id;
            fpayReference = fpayResponse.data.transaction.reference;
            console.log('[Order] ✅ FPAY Mobile Money réussi:', {
              transactionId: fpayTransactionId,
              reference: fpayReference,
            });
          } else {
            // ✅ FPAY échoue mais on continue (Pawapay a déjà réussi)
            console.log('[Order] ⚠️ FPAY Mobile Money échoué - statut:', fpayResponse?.data?.transaction?.status);
          }
        } catch (error: any) {
          // ✅ FPAY en erreur mais on continue (Pawapay a déjà réussi)
          console.log('[Order] FPAY Mobile Money ignoré (erreur):', error.message);
        }
      } else if (paymentMethod === PaymentMethod.FPAY) {
        selectedMethod = PaymentMethod.FPAY;

        const fpayData = {
          amount: totalAmount + (shippingCost || 0),
          currency: currency || 'USD',
          description: `Paiement de commande #${invoiceNumb}`,
          access_token: createOrderDto.access_token as string,
        };

        console.log('[Order] Tentative de paiement FPAY :', {
          userId: user.id,
          amount: fpayData.amount,
          currency: fpayData.currency,
          invoiceNumb,
          hasAccessToken: !!fpayData.access_token,
        });

        const fpayResponse = await this.fpayService.makePayment(fpayData, user);

        if (fpayResponse?.data?.transaction?.status === 'SUCCESS') {
          paymentStatus = PaymentStatus.PAID;
          orderStatus = OrderStatus.VALIDATED;
          isPaidByMobileMoney = true;
          fpayTransactionId = fpayResponse.data.transaction.id;
          fpayReference = fpayResponse.data.transaction.reference;

          console.log('[Order] ✅ Paiement FPAY réussi:', {
            transactionId: fpayTransactionId,
            reference: fpayReference,
            amount: fpayResponse.data.transaction.amount,
          });
        }
      }
      else if (selectedMethod === PaymentMethod.CASH) {
        paymentStatus = PaymentStatus.PENDING;
        orderStatus = OrderStatus.PENDING;
        isPaidByMobileMoney = false;
        console.log(`[Order] Commande restaurant avec paiement CASH`);
      } else {
        paymentStatus = PaymentStatus.PENDING;
        orderStatus = OrderStatus.PENDING;
        console.log(`[Order] Commande restaurant avec paiement ${selectedMethod} – en attente`);
      }
    } else {
      selectedMethod = paymentMethod || PaymentMethod.MANUAL;
      paymentStatus = PaymentStatus.PENDING;
      orderStatus = OrderStatus.PENDING;
      console.log(`[Order] Commande ${type} avec paiement ${selectedMethod} – en attente`);
    }

    const isRestaurantAutoPaid = type === CompanyType.RESTAURANT &&
      (selectedMethod === PaymentMethod.MOBILE_MONEY ||
        selectedMethod === PaymentMethod.CASH ||
        selectedMethod === PaymentMethod.FPAY); // ✅ Ajout FPAY

    const order = this.orderRepo.create({
      user,
      totalAmount,
      currency,
      grandTotal: isRestaurantAutoPaid ? (grandTotal ?? Number(totalAmount) + (shippingCost ?? 0)) : Number(totalAmount),
      addressUser,
      type,
      invoiceNumber: invoiceNumb,
      paymentStatus,
      status: orderStatus,
      whatsapp_number: whatsapp_number!,
      paymentMethod: selectedMethod,
      shippingCost: isRestaurantAutoPaid ? (shippingCost ?? 0) : 0,
      appliedFeeRate: isRestaurantAutoPaid ? (appliedFeeRate ?? 0) : 0,
      transactionFee: isRestaurantAutoPaid ? (transactionFee ?? 0) : 0,
      paid: paymentStatus === PaymentStatus.PAID,
    });
    await this.orderRepo.save(order);

    const orderItemEntities: OrderItemEntity[] = [];
    const groupedByCompany = new Map<string, { companyId: string; items: SubOrderItemEntity[]; total: number }>();

    for (const item of orderItems) {
      const product = await this.productRepo.findOne({ where: { id: item.productId }, relations: ['company'] });
      if (!product) {
        throw new NotFoundException(
          this.i18nService.translate('order.product_not_found', lang, { productId: item.productId }),
        );
      }
      const orderItem = this.orderItemRepo.create({ order, product, quantity: item.quantity, price: item.price });
      orderItemEntities.push(orderItem);
      const companyId = product.company.id;
      if (!groupedByCompany.has(companyId)) {
        groupedByCompany.set(companyId, { companyId, items: [], total: 0 });
      }
      const group = groupedByCompany.get(companyId)!;
      const subOrderItem = this.subOrderItemRepo.create({ product, quantity: item.quantity, price: item.price });
      group.items.push(subOrderItem);
      group.total += item.price * item.quantity;
    }
    await this.orderItemRepo.save(orderItemEntities);

    for (const [, group] of groupedByCompany) {
      const subOrder = this.subOrderRepo.create({
        order,
        company: { id: group.companyId } as any,
        totalAmount: group.total,
        status: orderStatus,
      });
      await this.subOrderRepo.save(subOrder);
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
    if (!finalOrder) {
      throw new NotFoundException(this.i18nService.translate('order.order_not_found_after_creation', lang));
    }

    const subOrders = await this.subOrderRepo.find({
      where: { order: { id: finalOrder.id } },
      relations: ['company', 'items', 'items.product', 'order'],
    });

    if (paymentStatus === PaymentStatus.PAID && type === CompanyType.RESTAURANT) {
      const operationAmount = isRestaurantAutoPaid ? (grandTotal ?? Number(totalAmount) + (shippingCost ?? 0)) : Number(totalAmount);
      const designation = this.i18nService.translate('order.payment_designation', lang, {
        invoiceNumber: order.invoiceNumber,
        method: selectedMethod,
      });
      const operationData: Partial<OperationEntity> = {
        debit: 0,
        credit: operationAmount,
        designation,
        status: OperationStatus.ACCEPTED,
        orderId: order.id,
        userId: user.id,
        paymentMethod: selectedMethod,
        reference: order.invoiceNumber,
      };

      // ✅ Ajout FPAY
      if (selectedMethod === PaymentMethod.FPAY) {
        operationData.fpayTransactionId = fpayTransactionId || '';
        operationData.fpayReference = fpayReference || '';
      }

      if (selectedMethod === PaymentMethod.MOBILE_MONEY && provider) operationData.provider = provider;
      const operation = this.operationRepo.create(operationData as any);
      await this.operationRepo.save(operation);
      console.log(`[Order] Opération ${selectedMethod} enregistrée pour la commande ${order.invoiceNumber}`);
    }

    const paymentQrCode = await QRCode.toDataURL(finalOrder.invoiceNumber);
    this.processOrderNotifications(finalOrder, subOrders, user, order, paymentQrCode, groupedByCompany, provider, lang).catch((err) =>
      console.error('Erreur notifications:', err),
    );
    return finalOrder;
  }

  async payPendingOrder(
    payOrderDto: PayOrderDto,
    user: UserEntity,
    signal?: AbortSignal,
    langHeader?: string,
  ): Promise<OrderEntity> {
    const { orderId, paymentMethod, provider, phone, access_token } = payOrderDto;
    const lang = langHeader || this.getUserLanguage(user);

    if (signal?.aborted) {
      throw new BadRequestException(
        this.i18nService.translate('order.order_request_aborted', lang)
      );
    }

    // 1. Récupérer la commande
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: [
        'user',
        'orderItems',
        'orderItems.product',
        'orderItems.product.company',
        'addressUser',
      ],
    });

    if (!order) {
      throw new NotFoundException(
        this.i18nService.translate('order.order_not_found', lang)
      );
    }

    // 2. Vérifier que la commande appartient à l'utilisateur
    if (order.user.id !== user.id) {
      throw new UnauthorizedException(
        this.i18nService.translate('order.unauthorized_payment', lang)
      );
    }

    // 3. Vérifier que la commande est en attente
    if (order.paymentStatus !== PaymentStatus.PENDING) {
      throw new BadRequestException(
        this.i18nService.translate('order.order_already_paid', lang)
      );
    }

    // 4. Vérifier que la commande n'est pas déjà payée
    if (order.paid) {
      throw new BadRequestException(
        this.i18nService.translate('order.order_already_paid', lang)
      );
    }

    // 5. Variables pour suivre l'état du paiement
    let paymentStatus = PaymentStatus.PENDING;
    let orderStatus = OrderStatus.PENDING;
    let isPaidByMobileMoney = false;
    let selectedMethod: PaymentMethod = PaymentMethod.MANUAL;
    let fpayTransactionId: string | null = null;
    let fpayReference: string | null = null;

    // 6. Traiter le paiement selon la méthode choisie
    if (paymentMethod === PaymentMethod.MOBILE_MONEY) {
      selectedMethod = PaymentMethod.MOBILE_MONEY;

      if (!provider || !phone) {
        throw new BadRequestException(
          this.i18nService.translate('order.mobile_money_provider_phone_required', lang)
        );
      }

      const phon = phone.trim();
      if (!phon) {
        throw new BadRequestException(
          this.i18nService.translate('order.mobile_money_invalid_phone', lang)
        );
      }

      if (!order.grandTotal) {
        throw new BadRequestException(
          this.i18nService.translate('order.mobile_money_grandtotal_required', lang)
        );
      }

      // ✅ CORRECTION : Utiliser le nombre directement
      const amount = order.grandTotal;

      const pawapayData = {
        amount: amount.toString(),
        currency: order.currency,
        provider,
        phone: phon
      };

      console.log('[PayOrder] Création dépôt Pawapay :', pawapayData);

      try {
        const pawapayResponse = await this.pawapayService.createDepositSimple(pawapayData, signal);
        console.log('[PayOrder] Réponse Pawapay :', JSON.stringify(pawapayResponse, null, 2));

        const depositStatus = pawapayResponse.finalStatus?.data?.status;
        const failureReason = pawapayResponse.finalStatus?.data?.failureReason;

        switch (depositStatus) {
          case 'COMPLETED':
            console.log('[PayOrder] ✅ Dépôt Pawapay confirmé : COMPLETED');
            paymentStatus = PaymentStatus.PAID;
            orderStatus = OrderStatus.VALIDATED;
            isPaidByMobileMoney = true;
            break;

          case 'REJECTED':
            console.log('[PayOrder] ❌ Dépôt Pawapay REJETÉ');

            if (failureReason) {
              const failureCode = failureReason.failureCode;
              const failureMessage = failureReason.failureMessage;

              console.log(`[PayOrder] Code: ${failureCode}, Message: ${failureMessage}`);

              let userMessage = this.i18nService.translate('order.payment_failed', lang);

              switch (failureCode) {
                case 'INVALID_AMOUNT':
                  userMessage = `Le montant n'est pas valide. ${failureMessage}`;
                  break;
                case 'AMOUNT_OUT_OF_BOUNDS':
                  userMessage = `Le montant est en dehors des limites autorisées. ${failureMessage}`;
                  break;
                case 'INVALID_CURRENCY':
                  userMessage = `La devise n'est pas supportée. ${failureMessage}`;
                  break;
                case 'INVALID_PHONE_NUMBER':
                  userMessage = `Le numéro de téléphone n'est pas valide. ${failureMessage}`;
                  break;
                case 'INVALID_PROVIDER':
                  userMessage = `Le fournisseur n'est pas valide. ${failureMessage}`;
                  break;
                case 'INSUFFICIENT_BALANCE':
                  userMessage = `Solde insuffisant. ${failureMessage}`;
                  break;
                case 'PROVIDER_UNAVAILABLE':
                  userMessage = `Le fournisseur est temporairement indisponible. ${failureMessage}`;
                  break;
                default:
                  userMessage = failureMessage || this.i18nService.translate('order.payment_failed', lang);
              }

              throw new BadRequestException(userMessage);
            }

            throw new BadRequestException(this.i18nService.translate('order.payment_failed', lang));

          case 'FAILED':
            console.log('[PayOrder] ❌ Dépôt Pawapay FAILED');
            const failMsg = failureReason?.failureMessage || this.i18nService.translate('order.payment_failed', lang);
            throw new BadRequestException(failMsg);

          case 'CANCELED':
            console.log('[PayOrder] ❌ Dépôt Pawapay CANCELED');
            throw new BadRequestException('Le paiement a été annulé.');

          case 'EXPIRED':
            console.log('[PayOrder] ❌ Dépôt Pawapay EXPIRED');
            throw new BadRequestException('Le paiement a expiré. Veuillez réessayer.');

          default:
            console.log(`[PayOrder] ❌ Statut inconnu: ${depositStatus}`);
            throw new BadRequestException(
              this.i18nService.translate('order.payment_failed', lang)
            );
        }
      } catch (error: any) {
        if (error.name === 'AbortError' || signal?.aborted) {
          console.log('[PayOrder] ⚠️ Opération annulée par l\'utilisateur');
          throw new BadRequestException(
            this.i18nService.translate('order.order_request_aborted', lang)
          );
        }

        if (error instanceof BadRequestException) {
          throw error;
        }

        console.error('[PayOrder] Erreur Pawapay:', error.message);
        throw new BadRequestException(
          error.message || this.i18nService.translate('order.payment_failed', lang)
        );
      }

      // Tenter FPAY en parallèle
      try {
        const fpayResponse = await this.fpayService.payWithMobileMoney(
          amount,
          order.currency || 'USD',
          `Paiement de commande #${order.invoiceNumber}`,
          'MOBILE_MONEY',
          lang
        );

        if (fpayResponse?.data?.transaction?.status === 'SUCCESS') {
          paymentStatus = PaymentStatus.PAID;
          orderStatus = OrderStatus.VALIDATED;
          isPaidByMobileMoney = true;
          fpayTransactionId = fpayResponse.data.transaction.id;
          fpayReference = fpayResponse.data.transaction.reference;
        }
      } catch (error: any) {
        console.log('[PayOrder] FPAY optionnel ignoré:', error.message);
      }

    } else if (paymentMethod === PaymentMethod.FPAY) {
      selectedMethod = PaymentMethod.FPAY;

      if (!access_token) {
        throw new BadRequestException(
          this.i18nService.translate('order.fpay_access_token_required', lang)
        );
      }

      // ✅ CORRECTION : Calculer et nettoyer le montant
      const totalAmount = Number(order.totalAmount) + Number(order.shippingCost || 0);

      // ✅ S'assurer que le montant est un nombre valide
      const cleanAmount = Number(totalAmount);

      console.log('[PayOrder] Montant original:', totalAmount);
      console.log('[PayOrder] Montant nettoyé:', cleanAmount);

      if (isNaN(cleanAmount) || cleanAmount <= 0) {
        throw new BadRequestException(
          'Le montant total est invalide'
        );
      }

      const fpayData = {
        amount: cleanAmount, // ✅ Envoyer comme nombre
        currency: order.currency || 'USD',
        description: `Paiement de commande #${order.invoiceNumber}`,
        access_token: access_token,
      };

      console.log('[PayOrder] Tentative de paiement FPAY :', {
        userId: user.id,
        amount: fpayData.amount,
        currency: fpayData.currency,
        invoiceNumber: order.invoiceNumber,
        hasAccessToken: !!fpayData.access_token,
      });

      try {
        const fpayResponse = await this.fpayService.makePayment(fpayData, user);

        if (fpayResponse?.data?.transaction?.status === 'SUCCESS') {
          paymentStatus = PaymentStatus.PAID;
          orderStatus = OrderStatus.VALIDATED;
          isPaidByMobileMoney = true;
          fpayTransactionId = fpayResponse.data.transaction.id;
          fpayReference = fpayResponse.data.transaction.reference;

          console.log('[PayOrder] ✅ Paiement FPAY réussi:', {
            transactionId: fpayTransactionId,
            reference: fpayReference,
            amount: fpayResponse.data.transaction.amount,
          });
        } else {
          // ✅ Si FPAY échoue, on garde le statut PENDING
          console.log('[PayOrder] ❌ Paiement FPAY échoué:', fpayResponse);
          throw new BadRequestException(
            this.i18nService.translate('order.payment_failed', lang)
          );
        }
      } catch (error: any) {
        console.error('[PayOrder] Erreur FPAY:', error.message);
        throw new BadRequestException(
          this.i18nService.translate('order.payment_failed', lang)
        );
      }

    } else {
      throw new BadRequestException(
        this.i18nService.translate('order.invalid_payment_method', lang, {
          method: paymentMethod,
        })
      );
    }

    // 7. Mettre à jour la commande
    order.paymentStatus = paymentStatus;
    order.status = orderStatus;
    order.paid = paymentStatus === PaymentStatus.PAID;
    order.paymentMethod = selectedMethod;

    await this.orderRepo.save(order);

    // 8. Mettre à jour les sous-commandes
    if (paymentStatus === PaymentStatus.PAID) {
      const subOrders = await this.subOrderRepo.find({
        where: { order: { id: order.id } },
      });

      for (const subOrder of subOrders) {
        subOrder.status = orderStatus;
        await this.subOrderRepo.save(subOrder);
      }
    }

    // 9. Créer l'opération financière
    if (paymentStatus === PaymentStatus.PAID) {
      const operationAmount = order.grandTotal || order.totalAmount;
      const designation = this.i18nService.translate('order.payment_designation', lang, {
        invoiceNumber: order.invoiceNumber,
        method: selectedMethod,
      });

      const operationData: Partial<OperationEntity> = {
        debit: 0,
        credit: operationAmount,
        designation,
        status: OperationStatus.ACCEPTED,
        orderId: order.id,
        userId: user.id,
        paymentMethod: selectedMethod,
        reference: order.invoiceNumber,
      };

      if (selectedMethod === PaymentMethod.FPAY) {
        operationData.fpayTransactionId = fpayTransactionId || '';
        operationData.fpayReference = fpayReference || '';
      }

      if (selectedMethod === PaymentMethod.MOBILE_MONEY && provider) {
        operationData.provider = provider;
      }

      const operation = this.operationRepo.create(operationData as any);
      await this.operationRepo.save(operation);

      console.log(`[PayOrder] Opération ${selectedMethod} enregistrée pour la commande ${order.invoiceNumber}`);
    }

    // 10. Récupérer la commande mise à jour
    const updatedOrder = await this.orderRepo.findOne({
      where: { id: order.id },
      relations: [
        'orderItems',
        'orderItems.product',
        'orderItems.product.company',
        'orderItems.product.category',
        'orderItems.product.measure',
        'subOrders',
        'subOrders.items',
        'subOrders.items.product',
        'subOrders.items.product.company',
        'subOrders.company',
        'user',
        'addressUser',
      ],
    });

    if (!updatedOrder) {
      throw new NotFoundException(
        this.i18nService.translate('order.order_not_found_after_update', lang)
      );
    }

    // 11. NOTIFICATIONS
    if (paymentStatus === PaymentStatus.PAID) {
      const subOrdersForNotification = await this.subOrderRepo.find({
        where: { order: { id: updatedOrder.id } },
        relations: ['company', 'items', 'items.product', 'order'],
      });

      const groupedByCompany = new Map<string, { companyId: string; items: any[]; total: number }>();
      for (const subOrder of subOrdersForNotification) {
        if (subOrder.company) {
          const companyId = subOrder.company.id;
          if (!groupedByCompany.has(companyId)) {
            groupedByCompany.set(companyId, {
              companyId,
              items: [],
              total: 0
            });
          }
          const group = groupedByCompany.get(companyId)!;
          for (const item of subOrder.items || []) {
            group.items.push(item);
            group.total += item.price * item.quantity;
          }
        }
      }

      const paymentQrCode = await QRCode.toDataURL(updatedOrder.invoiceNumber);

      this.processPaymentNotifications(
        updatedOrder,
        subOrdersForNotification,
        user,
        order,
        paymentQrCode,
        groupedByCompany,
        provider,
        lang
      ).catch((err) =>
        console.error('[PayOrder] Erreur notifications:', err),
      );
    }

    return updatedOrder;
  }

  private async processPaymentNotifications(
    finalOrder: OrderEntity,
    subOrders: SubOrderEntity[],
    user: UserEntity,
    order: OrderEntity,
    paymentQrCode: string,
    groupedByCompany: Map<string, { companyId: string; items: SubOrderItemEntity[]; total: number }>,
    provider?: string,
    lang: string = 'fr',
  ): Promise<void> {
    try {
      const hasEmail = user.email && user.email.trim() !== '';
      const hasPhone = user.phone && user.phone.trim() !== '';

      let imageUrl: string | undefined;
      if (finalOrder.orderItems?.length) {
        const firstItem = finalOrder.orderItems[0];
        if (firstItem.product?.images?.length) imageUrl = firstItem.product.images[0].url;
        else if (firstItem.product?.image) imageUrl = firstItem.product.image;
      }

      const emailTranslations = {
        invoice: this.i18nService.translate('order.email.invoice', lang),
        billed_to: this.i18nService.translate('order.email.billed_to', lang),
        customer_info: this.i18nService.translate('order.email.customer_info', lang),
        client: this.i18nService.translate('order.email.client', lang),
        email_label: this.i18nService.translate('order.email.email', lang),
        phone_label: this.i18nService.translate('order.email.phone', lang),
        address_label: this.i18nService.translate('order.email.address', lang),
        pin: this.i18nService.translate('order.email.pin', lang),
        date: this.i18nService.translate('order.email.date', lang),
        reference: this.i18nService.translate('order.email.reference', lang),
        number: this.i18nService.translate('order.email.number', lang),
        products: this.i18nService.translate('order.email.products', lang),
        unit_price: this.i18nService.translate('order.email.unit_price', lang),
        qty: this.i18nService.translate('order.email.qty', lang),
        total: this.i18nService.translate('order.email.total', lang),
        no_items: this.i18nService.translate('order.email.no_items', lang),
        payment_info: this.i18nService.translate('order.email.payment_info', lang),
        account: this.i18nService.translate('order.email.account', lang),
        name: this.i18nService.translate('order.email.name', lang),
        mobile_money: this.i18nService.translate('order.email.mobile_money', lang),
        summary: this.i18nService.translate('order.email.summary', lang),
        subtotal: this.i18nService.translate('order.email.subtotal', lang),
        delivery: this.i18nService.translate('order.email.delivery', lang),
        total_amount: this.i18nService.translate('order.email.total_amount', lang),
        thank_you: this.i18nService.translate('order.email.thank_you', lang),
        thanks_team: this.i18nService.translate('order.email.thanks_team', lang),
        contact: this.i18nService.translate('order.email.contact', lang),
        status_paid: this.i18nService.translate('order.email.status_paid', lang),
        status_pending: this.i18nService.translate('order.email.status_pending', lang),
        status_rejected: this.i18nService.translate('order.email.status_rejected', lang),
      };

      const notificationOptions: any = {
        userId: user.id,
        pushTitle: this.i18nService.translate('order.push_order_paid_title', lang),
        pushBody: this.i18nService.translate('order.push_order_paid_body', lang, {
          invoiceNumber: order.invoiceNumber,
          pin: order.pin,
        }),
        pushData: { entity: 'ORDER', entityId: finalOrder.id },
        imageUrl,
      };

      if (hasPhone) {
        notificationOptions.phoneNumber = user.phone;
        notificationOptions.smsBody = this.i18nService.translate('order.sms_order_validated', lang, {
          invoiceNumber: order.invoiceNumber,
          shippingCost: order.shippingCost,
          currency: order.currency,
          pin: order.pin,
        });
        notificationOptions.whatsappNumber = user.phone;
        notificationOptions.whatsappBody = this.i18nService.translate('order.whatsapp_order_paid', lang, {
          invoiceNumber: order.invoiceNumber,
          pin: order.pin,
        });
        notificationOptions.whatsappImageUrl = imageUrl;
      }

      if (hasEmail) {
        notificationOptions.emailTo = user.email;
        notificationOptions.emailSubject = this.i18nService.translate('order.paid_invoice_subject', lang);
        notificationOptions.emailContext = {
          pinCode: order.pin,
          invoiceNumber: order.invoiceNumber,
          user: order.user,
          subOrders,
          order,
          year: new Date().getFullYear(),
          translations: emailTranslations,
          lang,
        };
        notificationOptions.sendInvoicePaidWithPdf = true;
      }

      await this.pushNotificationHelper.sendAll(notificationOptions);

      await this.notificationHelpers.sendNotification(
        this.notificationsService,
        user.id,
        NotificationType.ORDER_CREATED,
        lang,
        { invoiceNumber: finalOrder.invoiceNumber, totalAmount: finalOrder.totalAmount, currency: finalOrder.currency },
        'ORDER',
        finalOrder.id,
      );

      // Envoyer aux administrateurs par ville
      const resourceName = this.permissionHelper.getOrderResourceByCompanyType(finalOrder.type);
      console.log(`🔍 Resource name: ${resourceName}`);

      let orderCityId: string | null = null;
      let orderCityName: string | null = null;

      if (subOrders.length > 0) {
        const firstSubOrder = subOrders[0];
        if (firstSubOrder.company?.cityId) {
          orderCityId = firstSubOrder.company.cityId;
          const city = await this.cityRepo.findOne({
            where: { id: orderCityId }
          });
          if (city) {
            orderCityName = city.name;
          }
        }
      }

      console.log(`🏙️ Ville de la commande: ${orderCityName} (${orderCityId})`);

      if (orderCityId) {
        const branchesInCity = await this.branchRepo.find({
          where: { cityId: orderCityId },
          select: ['id']
        });

        const branchIdsInCity = branchesInCity.map(b => b.id);
        console.log(`🏢 Branches dans la ville ${orderCityName}: ${branchIdsInCity.length}`);

        if (branchIdsInCity.length > 0) {
          const adminUsers = await this.userRepository
            .createQueryBuilder('u')
            .innerJoin('user_has_company', 'uhc', 'uhc.userId = u.id')
            .innerJoin('company_has_user_resource', 'chur', 'chur.userCompanyId = uhc.id')
            .innerJoin('resources', 'r', 'r.id = chur.resourceId')
            .innerJoin('branches', 'b', 'b.id = chur.branchId')
            .where('u.role = :role', { role: 'ADMIN' })
            .andWhere('r.name = :resourceName', { resourceName })
            .andWhere(
              '(chur.canManage = :canManage OR (chur.canRead = :canRead AND b.cityId = :orderCityId))',
              { canManage: true, canRead: true, orderCityId }
            )
            .getMany();

          console.log(`👥 Admins trouvés: ${adminUsers.length}`);

          const processedRecipients = new Set<string>([user.id]);

          for (const admin of adminUsers) {
            if (processedRecipients.has(admin.id)) continue;
            processedRecipients.add(admin.id);

            await this.notificationsService.sendNotificationToUser(
              admin.id,
              this.i18nService.translate('notification.order_paid_title', lang),
              this.i18nService.translate('notification.order_paid_content', lang, {
                invoiceNumber: finalOrder.invoiceNumber,
                totalAmount: finalOrder.totalAmount,
                currency: finalOrder.currency,
                paymentMethod: order.paymentMethod,
              }),
              finalOrder.type as any,
              {
                orderId: finalOrder.id,
                invoiceNumber: finalOrder.invoiceNumber,
                totalAmount: finalOrder.totalAmount,
                currency: finalOrder.currency,
                type: finalOrder.type,
                city: orderCityName,
                paymentMethod: order.paymentMethod,
                paymentStatus: order.paymentStatus,
              }
            );
          }

          const superAdmins = await this.userRepository.find({
            where: { role: UserRole.SUPER_ADMIN },
          });

          for (const admin of superAdmins) {
            if (processedRecipients.has(admin.id)) continue;

            await this.notificationsService.sendNotificationToUser(
              admin.id,
              this.i18nService.translate('notification.order_paid_title', lang),
              this.i18nService.translate('notification.order_paid_content', lang, {
                invoiceNumber: finalOrder.invoiceNumber,
                totalAmount: finalOrder.totalAmount,
                currency: finalOrder.currency,
                paymentMethod: order.paymentMethod,
              }),
              finalOrder.type as any,
              {
                orderId: finalOrder.id,
                invoiceNumber: finalOrder.invoiceNumber,
                totalAmount: finalOrder.totalAmount,
                currency: finalOrder.currency,
                type: finalOrder.type,
                city: orderCityName,
                paymentMethod: order.paymentMethod,
                paymentStatus: order.paymentStatus,
              }
            );
          }
        }
      }

      console.log('✅ [processPaymentNotifications] Terminé');
    } catch (error) {
      console.error('❌ Erreur dans processPaymentNotifications:', error);
    }
  }
  // ======================== NOTIFICATIONS APRÈS CRÉATION ========================
  private async processOrderNotifications(
    finalOrder: OrderEntity,
    subOrders: SubOrderEntity[],
    user: UserEntity,
    order: OrderEntity,
    paymentQrCode: string,
    groupedByCompany: Map<string, { companyId: string; items: SubOrderItemEntity[]; total: number }>,
    provider?: string,
    lang: string = 'fr',
  ): Promise<void> {
    try {
      const hasEmail = user.email && user.email.trim() !== '';
      const hasPhone = user.phone && user.phone.trim() !== '';

      let imageUrl: string | undefined;
      if (finalOrder.orderItems?.length) {
        const firstItem = finalOrder.orderItems[0];
        if (firstItem.product?.images?.length) imageUrl = firstItem.product.images[0].url;
        else if (firstItem.product?.image) imageUrl = firstItem.product.image;
      }

      const emailTranslations = {
        invoice: this.i18nService.translate('order.email.invoice', lang),
        billed_to: this.i18nService.translate('order.email.billed_to', lang),
        customer_info: this.i18nService.translate('order.email.customer_info', lang),
        client: this.i18nService.translate('order.email.client', lang),
        email_label: this.i18nService.translate('order.email.email', lang),
        phone_label: this.i18nService.translate('order.email.phone', lang),
        address_label: this.i18nService.translate('order.email.address', lang),
        pin: this.i18nService.translate('order.email.pin', lang),
        date: this.i18nService.translate('order.email.date', lang),
        reference: this.i18nService.translate('order.email.reference', lang),
        number: this.i18nService.translate('order.email.number', lang),
        products: this.i18nService.translate('order.email.products', lang),
        unit_price: this.i18nService.translate('order.email.unit_price', lang),
        qty: this.i18nService.translate('order.email.qty', lang),
        total: this.i18nService.translate('order.email.total', lang),
        no_items: this.i18nService.translate('order.email.no_items', lang),
        payment_info: this.i18nService.translate('order.email.payment_info', lang),
        account: this.i18nService.translate('order.email.account', lang),
        name: this.i18nService.translate('order.email.name', lang),
        mobile_money: this.i18nService.translate('order.email.mobile_money', lang),
        summary: this.i18nService.translate('order.email.summary', lang),
        subtotal: this.i18nService.translate('order.email.subtotal', lang),
        delivery: this.i18nService.translate('order.email.delivery', lang),
        total_amount: this.i18nService.translate('order.email.total_amount', lang),
        thank_you: this.i18nService.translate('order.email.thank_you', lang),
        thanks_team: this.i18nService.translate('order.email.thanks_team', lang),
        contact: this.i18nService.translate('order.email.contact', lang),
        status_paid: this.i18nService.translate('order.email.status_paid', lang),
        status_pending: this.i18nService.translate('order.email.status_pending', lang),
        status_rejected: this.i18nService.translate('order.email.status_rejected', lang),
      };

      // 🔥 NOTIFICATION AU CRÉATEUR
      const notificationOptions: any = {
        userId: user.id,
        pushTitle: '',
        pushBody: '',
        pushData: { entity: 'ORDER', entityId: finalOrder.id },
        imageUrl,
      };

      if (order.paymentStatus === PaymentStatus.PAID) {
        if (!order.pin) {
          order.pin = GeneratePin.generate();
          await this.orderRepo.save(order);
        }
        notificationOptions.pushTitle = this.i18nService.translate('order.push_order_paid_title', lang);
        notificationOptions.pushBody = this.i18nService.translate('order.push_order_paid_body', lang, {
          invoiceNumber: order.invoiceNumber,
          pin: order.pin,
        });
        if (hasEmail) {
          notificationOptions.emailTo = user.email;
          notificationOptions.emailSubject = this.i18nService.translate('order.paid_invoice_subject', lang);
          notificationOptions.emailContext = {
            pinCode: order.pin,
            invoiceNumber: order.invoiceNumber,
            user: order.user,
            subOrders,
            order,
            year: new Date().getFullYear(),
            translations: emailTranslations,
            lang,
          };
          notificationOptions.sendInvoicePaidWithPdf = true;
        }
        if (hasPhone) {
          notificationOptions.phoneNumber = user.phone;
          notificationOptions.smsBody = this.i18nService.translate('order.sms_order_validated', lang, {
            invoiceNumber: order.invoiceNumber,
            shippingCost: order.shippingCost,
            currency: order.currency,
            pin: order.pin,
          });
        }
      } else {
        notificationOptions.pushTitle = this.i18nService.translate('order.push_order_pending_title', lang);
        notificationOptions.pushBody = this.i18nService.translate('order.push_order_pending_body', lang, {
          invoiceNumber: order.invoiceNumber,
        });
        if (hasPhone) {
          notificationOptions.phoneNumber = user.phone;
          notificationOptions.smsBody = this.i18nService.translate('order.sms_order_pending', lang, {
            invoiceNumber: order.invoiceNumber,
            totalAmount: order.totalAmount,
            currency: order.currency,
          });
        }
        if (hasEmail) {
          notificationOptions.emailTo = user.email;
          notificationOptions.emailSubject = this.i18nService.translate('order.invoice_subject', lang);
          notificationOptions.emailContext = {
            invoiceNumber: order.invoiceNumber,
            user: order.user,
            subOrders,
            order,
            year: new Date().getFullYear(),
            translations: emailTranslations,
            lang,
          };
          notificationOptions.sendInvoicePaidWithPdf = true;
        }
      }

      await this.pushNotificationHelper.sendAll(notificationOptions);

      await this.notificationHelpers.sendNotification(
        this.notificationsService,
        user.id,
        NotificationType.ORDER_CREATED,
        lang,
        { invoiceNumber: finalOrder.invoiceNumber, totalAmount: finalOrder.totalAmount, currency: finalOrder.currency },
        'ORDER',
        finalOrder.id,
      );

      // 🔥🔥🔥 ENVOYER AUX ADMINISTRATEURS PAR VILLE 🔥🔥🔥
      const resourceName = this.permissionHelper.getOrderResourceByCompanyType(finalOrder.type);
      console.log(`🔍 Resource name: ${resourceName}`);

      // 🔥 ÉTAPE 1: Récupérer la ville de la commande
      // La ville de la commande = ville de l'entreprise qui vend le produit
      let orderCityId: string | null = null;
      let orderCityName: string | null = null;

      // Récupérer la première sous-commande pour avoir l'entreprise
      if (subOrders.length > 0) {
        const firstSubOrder = subOrders[0];
        if (firstSubOrder.company?.cityId) {
          orderCityId = firstSubOrder.company.cityId;
          // Récupérer le nom de la ville
          const city = await this.cityRepo.findOne({
            where: { id: orderCityId }
          });
          if (city) {
            orderCityName = city.name;
          }
        }
      }

      console.log(`🏙️ Ville de la commande: ${orderCityName} (${orderCityId})`);

      if (!orderCityId) {
        console.log('⚠️ Impossible de déterminer la ville de la commande');
        return;
      }

      // 🔥 ÉTAPE 2: Récupérer les branches qui sont dans la ville de la commande
      const branchesInCity = await this.branchRepo.find({
        where: { cityId: orderCityId },
        select: ['id']
      });

      const branchIdsInCity = branchesInCity.map(b => b.id);
      console.log(`🏢 Branches dans la ville ${orderCityName}: ${branchIdsInCity.length}`);

      if (branchIdsInCity.length === 0) {
        console.log('⚠️ Aucune branche trouvée dans cette ville');
        return;
      }

      // 🔥 ÉTAPE 3: Récupérer les ADMINISTRATEURS qui ont canManage sur la ressource
      // ET qui sont dans une branche de la ville
      const adminUsers = await this.userRepository
        .createQueryBuilder('u')
        .innerJoin('user_has_company', 'uhc', 'uhc.userId = u.id')
        .innerJoin('company_has_user_resource', 'chur', 'chur.userCompanyId = uhc.id')
        .innerJoin('resources', 'r', 'r.id = chur.resourceId')
        .innerJoin('branches', 'b', 'b.id = chur.branchId')
        .where('u.role = :role', { role: 'ADMIN' })
        .andWhere('r.name = :resourceName', { resourceName })
        .andWhere(
          // ✅ canManage = true (voit tout) OU (canRead = true ET dans la même ville)
          '(chur.canManage = :canManage OR (chur.canRead = :canRead AND b.cityId = :orderCityId))',
          { canManage: true, canRead: true, orderCityId }
        )
        .getMany();

      console.log(`👥 Admins trouvés: ${adminUsers.length}`);
      if (adminUsers.length > 0) {
        console.log(`👥 Admins: ${adminUsers.map(a => a.fullName).join(', ')}`);
      }

      const processedRecipients = new Set<string>([user.id]);

      // 🔥 Envoyer les notifications aux admins de la ville
      for (const admin of adminUsers) {
        if (processedRecipients.has(admin.id)) continue;
        processedRecipients.add(admin.id);

        console.log(`📨 Envoi notification à l'admin: ${admin.fullName} (${admin.id}) - Ville: ${orderCityName}`);

        await this.notificationsService.sendNotificationToUser(
          admin.id,
          this.i18nService.translate('notification.order_created_title', lang),
          this.i18nService.translate('notification.order_created_content', lang, {
            invoiceNumber: finalOrder.invoiceNumber,
            totalAmount: finalOrder.totalAmount,
            currency: finalOrder.currency,
          }),
          finalOrder.type as any,
          {
            orderId: finalOrder.id,
            invoiceNumber: finalOrder.invoiceNumber,
            totalAmount: finalOrder.totalAmount,
            currency: finalOrder.currency,
            type: finalOrder.type,
            city: orderCityName,
          }
        );

        await this.notificationsService.sendAndSaveNotification(
          admin.id,
          this.i18nService.translate('notification.order_created_title', lang),
          this.i18nService.translate('notification.order_created_content', lang, {
            invoiceNumber: finalOrder.invoiceNumber,
            totalAmount: finalOrder.totalAmount,
            currency: finalOrder.currency,
          }),
          finalOrder.type as any,
          {
            orderId: finalOrder.id,
            invoiceNumber: finalOrder.invoiceNumber,
            totalAmount: finalOrder.totalAmount,
            currency: finalOrder.currency,
            type: finalOrder.type,
            city: orderCityName,
          }
        );
      }

      // 🔥 SUPER ADMIN (toujours notifiés, sans filtre de ville)
      const superAdmins = await this.userRepository.find({
        where: { role: UserRole.SUPER_ADMIN },
      });

      for (const admin of superAdmins) {
        if (processedRecipients.has(admin.id)) continue;

        console.log(`📨 Envoi notification au SUPER ADMIN: ${admin.fullName} (${admin.id})`);

        await this.notificationsService.sendNotificationToUser(
          admin.id,
          this.i18nService.translate('notification.order_created_title', lang),
          this.i18nService.translate('notification.order_created_content', lang, {
            invoiceNumber: finalOrder.invoiceNumber,
            totalAmount: finalOrder.totalAmount,
            currency: finalOrder.currency,
          }),
          finalOrder.type as any,
          {
            orderId: finalOrder.id,
            invoiceNumber: finalOrder.invoiceNumber,
            totalAmount: finalOrder.totalAmount,
            currency: finalOrder.currency,
            type: finalOrder.type,
            city: orderCityName,
          }
        );
      }

      console.log('✅ [processOrderNotifications] Terminé');
    } catch (error) {
      console.error('❌ Erreur dans processOrderNotifications:', error);
    }
  }
  // ======================== MISE À JOUR DU STATUT ========================
  async updateOrderStatus(
    orderId: string,
    dto: UpdateOrderStatusDto,
    user: UserEntity,
    langHeader?: string,
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
      const lang = langHeader || 'fr';
      throw new NotFoundException(this.i18nService.translate('order.order_not_found_by_id', lang, { orderId }));
    }

    const lang = langHeader || this.getUserLanguage(order.user);

    if (dto.status === OrderStatus.REJECTED && order.status === OrderStatus.VALIDATED) {
      throw new BadRequestException(this.i18nService.translate('order.cannot_cancel_validated_order', lang));
    }
    if (!isValidStatusTransition(order.status, dto.status)) {
      throw new BadRequestException(
        this.i18nService.translate('order.invalid_status_transition', lang, {
          current: order.status,
          next: dto.status,
        }),
      );
    }
    if ([OrderStatus.PROCESSING, OrderStatus.COMPLETED, OrderStatus.DELIVERED].includes(dto.status)) {
      dto.shippingCost = order.shippingCost;
    }
    if (dto.status === OrderStatus.VALIDATED) {
      if (dto.shippingCost === undefined || dto.shippingCost === null) {
        throw new BadRequestException(this.i18nService.translate('order.shipping_cost_required_for_validation', lang));
      }
      order.shippingCost = dto.shippingCost;
      order.grandTotal = Number(order.totalAmount) + Number(dto.shippingCost);
    } else if (dto.shippingCost !== undefined) {
      order.shippingCost = dto.shippingCost;
      order.grandTotal = Number(order.totalAmount) + Number(dto.shippingCost);
    }

    order.status = dto.status;
    const now = new Date();
    switch (dto.status) {
      case OrderStatus.VALIDATED:
        order.validatedBy = user;
        order.validatedAt = now;
        break;
      case OrderStatus.PROCESSING:
        order.processingBy = user;
        order.processingAt = now;
        break;
      case OrderStatus.COMPLETED:
        order.completedBy = user;
        order.completedAt = now;
        break;
      case OrderStatus.DELIVERED:
        order.deliveredBy = user;
        order.deliveredAt = now;
        break;
      case OrderStatus.REJECTED:
        order.rejectedBy = user;
        order.rejectedAt = now;
        break;
    }

    if (order.subOrders?.length) {
      for (const subOrder of order.subOrders) {
        if (!isValidStatusTransition(subOrder.status, dto.status)) {
          throw new BadRequestException(
            this.i18nService.translate('order.suborder_status_transition_invalid', lang, {
              subOrderId: subOrder.id,
              current: subOrder.status,
              next: dto.status,
            }),
          );
        }
        subOrder.status = dto.status;
        await this.subOrderRepo.save(subOrder);
      }
    }

    let isNewlyValidated = false;
    if (dto.status === OrderStatus.VALIDATED) {
      const deductedProductIds = new Set<string>();
      for (const item of order.orderItems) {
        if (!deductedProductIds.has(item.product.id)) {
          item.product.quantity -= item.quantity;
          await this.productRepo.save(item.product);
          deductedProductIds.add(item.product.id);
        }
      }
      if (order.subOrders?.length) {
        for (const subOrder of order.subOrders) {
          for (const item of subOrder.items) {
            if (!deductedProductIds.has(item.product.id)) {
              item.product.quantity -= item.quantity;
              await this.productRepo.save(item.product);
              deductedProductIds.add(item.product.id);
            }
          }
        }
      }
      order.paymentStatus = PaymentStatus.PAID;
      order.paid = true;
      order.pin = GeneratePin.generate();
      const transaction = this.transactionRepository.create({
        orderId: order.id,
        amount: order.totalAmount,
        paymentStatus: PaymentStatus.PAID,
        transactionReference: uuidv4(),
        currency: 'USD',
        type: TransactionType.CREDIT,
      });
      await this.transactionRepository.save(transaction);
      isNewlyValidated = true;
    }

    const updatedOrder = await this.orderRepo.save(order);
    this.processOrderStatusUpdate(order, dto.status, isNewlyValidated, lang).catch((err) => console.error('Erreur notifications statut commande:', err));

    return {
      message: this.i18nService.translate('order.order_status_updated_message', lang, { orderId }),
      data: updatedOrder,
    };
  }

  // ======================== NOTIFICATIONS CHANGEMENT DE STATUT ========================
  private async processOrderStatusUpdate(
    order: OrderEntity,
    newStatus: OrderStatus,
    isNewlyValidated: boolean,
    lang: string = 'fr',
  ): Promise<void> {
    try {
      let imageUrl: string | undefined;
      if (order.orderItems?.length) {
        const firstItem = order.orderItems[0];
        if (firstItem.product?.images?.length) imageUrl = firstItem.product.images[0].url;
        else if (firstItem.product?.image) imageUrl = firstItem.product.image;
      }

      let inAppContentKey = '';
      switch (newStatus) {
        case OrderStatus.VALIDATED: inAppContentKey = 'order_validated'; break;
        case OrderStatus.PROCESSING: inAppContentKey = 'order_processing'; break;
        case OrderStatus.COMPLETED: inAppContentKey = 'order_completed'; break;
        case OrderStatus.DELIVERED: inAppContentKey = 'order_delivered'; break;
        case OrderStatus.REJECTED: inAppContentKey = 'order_rejected'; break;
        default: inAppContentKey = 'order_updated';
      }
      const inAppContent = this.i18nService.translate(inAppContentKey, lang, { invoiceNumber: order.invoiceNumber });
      await this.notificationsService.sendAndSaveNotification(
        order.userId,
        this.i18nService.translate(`push_${inAppContentKey}_title`, lang) || this.i18nService.translate('order.order_status_updated', lang),
        inAppContent,
        NotificationType.ORDER_UPDATED,
        { orderId: order.id, status: newStatus },
      );

      if (isNewlyValidated) {
        const hasEmail = order.user.email && order.user.email.trim() !== '';
        const hasPhone = order.user.phone && order.user.phone.trim() !== '';
        if (hasPhone) {
          const smsMessage = this.i18nService.translate('order.sms_order_validated', lang, {
            invoiceNumber: order.invoiceNumber,
            shippingCost: order.shippingCost,
            currency: order.currency,
            pin: order.pin,
          });
          await this.smsHelper.sendSms(order.user.phone, smsMessage);
        }
        await this.pushNotificationHelper.sendAll({
          userId: order.userId,
          pushTitle: this.i18nService.translate('order.push_order_validated_title', lang),
          pushBody: this.i18nService.translate('order.push_order_validated_body', lang, {
            invoiceNumber: order.invoiceNumber,
            pin: order.pin,
          }),
          pushData: { entity: 'ORDER', entityId: order.id },
          phoneNumber: hasPhone ? order.user.phone : undefined,
          smsBody: hasPhone
            ? this.i18nService.translate('order.sms_order_validated', lang, { invoiceNumber: order.invoiceNumber, pin: order.pin })
            : undefined,
          imageUrl,
        });
      } else {
        let pushTitleKey = '', pushBodyKey = '', smsKey = '';
        switch (newStatus) {
          case OrderStatus.PENDING:
            pushTitleKey = 'order.push_order_pending_title';
            pushBodyKey = 'order.push_order_pending_body';
            smsKey = 'order.sms_order_pending';
            break;
          case OrderStatus.PROCESSING:
            pushTitleKey = 'push_order_processing_title';
            pushBodyKey = 'push_order_processing_body';
            smsKey = 'order.sms_order_processing';
            break;
          case OrderStatus.COMPLETED:
            pushTitleKey = 'push_order_completed_title';
            pushBodyKey = 'push_order_completed_body';
            smsKey = 'order.sms_order_completed';
            break;
          case OrderStatus.DELIVERED:
            pushTitleKey = 'push_order_delivered_title';
            pushBodyKey = 'push_order_delivered_body';
            smsKey = 'order.sms_order_delivered';
            break;
          case OrderStatus.REJECTED:
            pushTitleKey = 'push_order_rejected_title';
            pushBodyKey = 'push_order_rejected_body';
            smsKey = 'order.sms_order_rejected';
            break;
          default:
            pushTitleKey = 'order.push_order_updated_title';
            pushBodyKey = 'order.push_order_updated_body';
            smsKey = '';
        }
        const pushTitle = this.i18nService.translate(pushTitleKey, lang, { invoiceNumber: order.invoiceNumber });
        const pushBody = this.i18nService.translate(pushBodyKey, lang, { invoiceNumber: order.invoiceNumber });
        await this.pushNotificationHelper.sendAll({
          userId: order.userId,
          pushTitle,
          pushBody,
          pushData: { entity: 'ORDER', entityId: order.id },
          phoneNumber: order.user.phone?.trim() ? order.user.phone : undefined,
          smsBody: smsKey ? this.i18nService.translate(smsKey, lang, { invoiceNumber: order.invoiceNumber }) : undefined,
          imageUrl,
        });
      }
    } catch (error) {
      console.error('Erreur dans processOrderStatusUpdate:', error);
    }
  }

  // ======================== GÉNÉRATION DE FACTURE PDF ========================
  async generateInvoiceByInvoiceNumber(
    invoiceNumber: string,
    lang: string = 'fr',
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
        this.i18nService.translate('order.not_found', lang, { invoiceNumber }),
      );
    }

    const subOrders = await this.subOrderRepo.find({
      where: { order: { id: order.id } },
      relations: ['company', 'items', 'items.product', 'order'],
    });
    const paymentQrCode = await QRCode.toDataURL(order.invoiceNumber);

    // Préparer les traductions pour le template
    const emailTranslations = {
      invoice: this.i18nService.translate('order.email.invoice', lang),
      billed_to: this.i18nService.translate('order.email.billed_to', lang),
      customer_info: this.i18nService.translate('order.email.customer_info', lang),
      client: this.i18nService.translate('order.email.client', lang),
      email_label: this.i18nService.translate('order.email.email', lang),
      phone_label: this.i18nService.translate('order.email.phone', lang),
      address_label: this.i18nService.translate('order.email.address', lang),
      pin: this.i18nService.translate('order.email.pin', lang),
      date: this.i18nService.translate('order.email.date', lang),
      reference: this.i18nService.translate('order.email.reference', lang),
      number: this.i18nService.translate('order.email.number', lang),
      products: this.i18nService.translate('order.email.products', lang),
      unit_price: this.i18nService.translate('order.email.unit_price', lang),
      qty: this.i18nService.translate('order.email.qty', lang),
      total: this.i18nService.translate('order.email.total', lang),
      no_items: this.i18nService.translate('order.email.no_items', lang),
      payment_info: this.i18nService.translate('order.email.payment_info', lang),
      account: this.i18nService.translate('order.email.account', lang),
      name: this.i18nService.translate('order.email.name', lang),
      mobile_money: this.i18nService.translate('order.email.mobile_money', lang),
      summary: this.i18nService.translate('order.email.summary', lang),
      subtotal: this.i18nService.translate('order.email.subtotal', lang),
      delivery: this.i18nService.translate('order.email.delivery', lang),
      total_amount: this.i18nService.translate('order.email.total_amount', lang),
      thank_you: this.i18nService.translate('order.email.thank_you', lang),
      thanks_team: this.i18nService.translate('order.email.thanks_team', lang),
      contact: this.i18nService.translate('order.email.contact', lang),
      status_paid: this.i18nService.translate('order.email.status_paid', lang),
      status_pending: this.i18nService.translate('order.email.status_pending', lang),
      status_rejected: this.i18nService.translate('order.email.status_rejected', lang),
    };

    const pdfBuffer = await this.mailService.generatePdfFromTemplate('invoice.ejs', {
      user: order.user,
      order,
      subOrders,
      paymentQrCode,
      translations: emailTranslations,
      lang,
      subOrdersHtml: this.mailService.generateSubOrdersByInvoiceNumberHtml(subOrders, order.currency), // si besoin
    });

    return {
      pdfBuffer,
      message: this.i18nService.translate('order.invoice_generated_success', lang),
    };
  }

  // ======================== MODIFICATION DE COMMANDE ========================
  // Dans le service OrderService

  async updateOrderShippingCost(
    orderId: string,
    shippingCost: number,
    user: UserEntity,
    lang: string = 'fr'
  ): Promise<{ message: string; data: OrderEntity }> {
    // 1️⃣ Récupérer la commande avec ses relations
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
      throw new NotFoundException(
        this.i18nService.translate('order.not_found', lang)
      );
    }

    // 2️⃣ Vérifier les permissions (corrigé)
    const isAdmin = user.role === UserRole.SUPER_ADMIN;
    const isOwner = order.userId === user.id;

    if (!isAdmin && !isOwner) {
      throw new ForbiddenException(
        this.i18nService.translate('order.access_denied', lang)
      );
    }

    // 3️⃣ Vérifier que le prix de livraison est valide
    if (shippingCost < 0) {
      throw new BadRequestException(
        this.i18nService.translate('order.shipping_cost_positive', lang)
      );
    }

    // 4️⃣ Vérifier que la commande n'est pas déjà finalisée
    if (
      order.status === OrderStatus.DELIVERED ||
      order.status === OrderStatus.VALIDATED ||
      order.status === OrderStatus.REJECTED
    ) {
      throw new BadRequestException(
        this.i18nService.translate('order.cannot_modify_finalized', lang)
      );
    }

    // 5️⃣ Enregistrer l'ancien prix
    const oldShippingCost = order.shippingCost || 0;

    // 6️⃣ Mettre à jour le prix de livraison
    order.shippingCost = shippingCost;

    // 7️⃣ Recalculer le grand total
    const itemsTotal = order.orderItems?.reduce(
      (sum, item) => sum + (item.price * item.quantity),
      0
    ) || 0;

    order.grandTotal = itemsTotal + shippingCost + (order.transactionFee || 0);

    // 8️⃣ Sauvegarder la commande
    const updatedOrder = await this.orderRepo.save(order);

    // 9️⃣ Retourner la commande mise à jour
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

    if (!finalOrder) {
      throw new NotFoundException(
        this.i18nService.translate('order.order_not_found_after_update', lang)
      );
    }

    return {
      message: this.i18nService.translate('order.shipping_cost_updated', lang, {
        oldCost: oldShippingCost,
        newCost: shippingCost,
      }),
      data: finalOrder,
    };
  }


  async getAllTransctions(): Promise<{ data: TransactionEntity[] }> {
    const transactions = await this.transactionRepository.find({ relations: ['order', 'order.user'] });
    return { data: transactions };
  }

  async getTransactionsByUser(
    userId: string,
    langHeader?: string,
  ): Promise<{ data: TransactionEntity[]; message: string }> {
    const transactions = await this.transactionRepository.find({
      where: { order: { user: { id: userId } } },
      relations: ['order', 'order.user'],
      order: { createdAt: 'DESC' },
    });
    const lang = langHeader || 'fr';
    return {
      data: transactions,
      message: transactions.length
        ? this.i18nService.translate('order.transactions_found', lang, { userId })
        : this.i18nService.translate('order.no_transactions_found', lang, { userId }),
    };
  }

  async getOrdersByUser(userId: string, pageNumber?: number, limitNumber?: number): Promise<OrderEntity[]> {
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
      order: { createdAt: 'DESC' },
    });
  }

  //   async getOrdersByUser(
  //   userId: string,
  //   page: number = 1,
  //   limit: number = 10,
  // ): Promise<PaginatedResponseDto<OrderEntity>> {
  //   const skip = (page - 1) * limit;

  //   const [orders, total] = await this.orderRepo.findAndCount({
  //     where: { user: { id: userId } },
  //     relations: [
  //       'orderItems.product.company',
  //       'orderItems.product.category',
  //       'orderItems.product.measure',
  //       'subOrders',
  //       'subOrders.items.product.company',
  //       'subOrders.items.product.category',
  //       'subOrders.items.product.measure',
  //       'subOrders.company',
  //       'user',
  //       'addressUser',
  //     ],
  //     order: { createdAt: 'DESC' },
  //     skip: skip,
  //     take: limit,
  //   });

  //   return new PaginatedResponseDto(orders, total, page, limit);
  // }

  async findByType(
    user: UserEntity,
    type?: string,
    page: number = 1,
    limit: number = 10,
    langHeader?: string,
  ): Promise<{ message: string; data: PaginatedResponseDto<OrderEntity> }> {
    const lang = langHeader || this.getUserLanguage(user);

    if (!user.activeCompanyId) {
      throw new BadRequestException(this.i18nService.translate('order.no_active_company', lang));
    }

    // 🔥 FORCER le rechargement de l'utilisateur avec ses relations
    const userWithRelations = await this.userRepository.findOne({
      where: { id: user.id },
      relations: ['activeBranch', 'activeBranch.city']
    });

    if (!userWithRelations) {
      throw new NotFoundException(this.i18nService.translate('user.not_found', lang));
    }

    const fullUser = userWithRelations;

    // Récupérer l'entreprise active
    const company = await this.companyRepo.findOne({
      where: { id: fullUser.activeCompanyId },
    });

    if (!company) {
      throw new NotFoundException(this.i18nService.translate('order.company_not_found', lang));
    }

    const isSuperAdmin = fullUser.role === 'SUPER ADMIN';
    const orderType = type || company.typeCompany;

    // 🔥 Filtrage par ville pour RESTAURANT et GROCERY uniquement
    const isCityFilterable = orderType === 'RESTAURANT' || orderType === 'GROCERY';

    // 🔥 Récupérer la ville de la branche active de l'utilisateur
    let userCityId: string | null = null;
    let userCityName: string | null = null;

    if (fullUser.activeBranch?.city) {
      userCityId = fullUser.activeBranch.city.id;
      userCityName = fullUser.activeBranch.city.name;
      console.log('✅ Branche active trouvée:', fullUser.activeBranch.name, 'Ville:', userCityName);
    } else if (fullUser.activeBranchId) {
      const branch = await this.branchRepo.findOne({
        where: { id: fullUser.activeBranchId },
        relations: ['city'],
      });
      if (branch?.city) {
        userCityId = branch.city.id;
        userCityName = branch.city.name;
        console.log('✅ Branche active chargée:', branch.name, 'Ville:', userCityName);
      } else {
        console.log('⚠️ La branche active n\'a pas de ville associée');
      }
    } else {
      console.log('⚠️ L\'utilisateur n\'a pas de branche active');
    }

    const hasCityFilter = isCityFilterable && !!userCityId;

    // 🔥 LOGS DE DEBUG
    console.log('🔍 DEBUG findByType:');
    console.log('user.id:', fullUser.id);
    console.log('user.activeBranchId:', fullUser.activeBranchId);
    console.log('userCityId:', userCityId);
    console.log('userCityName:', userCityName);
    console.log('hasCityFilter:', hasCityFilter);
    console.log('isSuperAdmin:', isSuperAdmin);
    console.log('isCityFilterable:', isCityFilterable);
    console.log('orderType:', orderType);

    // Déterminer la ressource et les permissions
    let hasManagePermission = false;
    let targetResource: string;

    const typeToResource: Record<string, string> = {
      RESTAURANT: 'ORDERS_RESTAURANT',
      SHOP: 'ORDERS_SHOP',
      CAR: 'ORDERS_CAR',
      GROCERY: 'ORDERS_MARKET',
      MARKET: 'ORDERS_MARKET',
    };

    if (type) {
      targetResource = typeToResource[type] || this.permissionHelper.getOrderResourceByCompanyType(company.typeCompany);
    } else {
      targetResource = this.permissionHelper.getOrderResourceByCompanyType(company.typeCompany);
    }

    hasManagePermission = await this.permissionHelper.hasManageOnResource(fullUser, targetResource);
    console.log('hasManagePermission:', hasManagePermission);

    // 🔥 Construire la requête
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
      .leftJoinAndSelect('subOrderCompany.city', 'subOrderCompanyCity')
      .orderBy('order.createdAt', 'DESC');

    // 🔥 Appliquer les filtres
    if (type) {
      query.where('order.type = :type', { type });
    } else {
      query.where('order.type = :type', { type: company.typeCompany });
    }

    // 🔥 Règle métier :
    // - SUPER ADMIN voit tout (pas de filtre)
    // - UTILISATEUR avec canManage voit tout (pas de filtre) 🔥 NOUVEAU
    // - AUTRES utilisateurs voient UNIQUEMENT les commandes de leur ville
    if (isSuperAdmin) {
      console.log('✅ SUPER ADMIN - Pas de filtre');
    } else if (hasManagePermission) {
      // 🔥 NOUVEAU: Les utilisateurs avec canManage voient toutes les commandes
      console.log('✅ canManage - Pas de filtre');
    } else if (!fullUser.activeBranchId) {
      throw new BadRequestException(
        this.i18nService.translate('order.no_active_branch', lang)
      );
    } else if (hasCityFilter) {
      // 🔥 FILTRE STRICT pour les utilisateurs sans canManage
      query.andWhere('subOrderCompany.cityId = :userCityId', { userCityId });
      console.log('✅ Filtre appliqué: subOrderCompany.cityId =', userCityId);
    } else {
      console.log('⚠️ Type non filtrable - pas de filtre supplémentaire');
    }

    // 🔥 Pagination
    const skip = (page - 1) * limit;
    query.skip(skip).take(limit);

    const sql = query.getSql();
    console.log('📝 SQL:', sql);

    const [orders, total] = await query.getManyAndCount();
    console.log('📊 Nombre de commandes trouvées:', total);

    // 🔥 Enrichir les commandes avec la ville de l'entreprise
    const enrichedOrders = orders.map(order => {
      let cityId: string | null = null;
      let cityName: string | null = null;

      if (order.subOrders && order.subOrders.length > 0) {
        const firstSubOrder = order.subOrders[0];
        if (firstSubOrder.company?.city) {
          cityId = firstSubOrder.company.city.id;
          cityName = firstSubOrder.company.city.name;
        }
      }

      return {
        ...order,
        cityId,
        cityName,
      };
    });

    const paginatedData = new PaginatedResponseDto(enrichedOrders, total, page, limit);

    // 🔥 Message
    let message: string;

    if (total === 0 && hasCityFilter && userCityName && !hasManagePermission) {
      message = this.i18nService.translate('order.no_orders_for_city', lang, {
        city: userCityName,
        resource: targetResource
      });
    } else if (isSuperAdmin) {
      message = this.i18nService.translate('order.orders_fetched_manage', lang, {
        resource: 'TOUTES LES COMMANDES'
      });
    } else if (hasManagePermission) {
      // 🔥 Message pour les utilisateurs avec canManage
      message = this.i18nService.translate('order.orders_fetched_manage_all', lang, {
        resource: targetResource
      });
    } else if (hasCityFilter && userCityName) {
      message = this.i18nService.translate('order.orders_fetched_company_city', lang, {
        companyName: company.companyName,
        city: userCityName
      });
    } else {
      message = this.i18nService.translate('order.orders_fetched_company', lang, {
        companyName: company.companyName
      });
    }

    return {
      message,
      data: paginatedData,
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
      const lang = 'fr';
      throw new NotFoundException(this.i18nService.translate('order.order_not_found_by_id', lang, { orderId }));
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
        'user',
        'addressUser',
        'subOrders',
        'subOrders.items.product.company',
        'subOrders.items.product.category',
        'subOrders.items.product.measure',
        'subOrders.company',
      ],
      order: { createdAt: 'DESC' },
    });
    const subOrders: SubOrderEntity[] = orders
      .flatMap(order => order.subOrders.map(sub => ({ ...sub, user: order.user, addressUser: order.addressUser })))
      .filter(sub => sub.company.id === companyId);
    return { data: subOrders };
  }

  async getDashboardData(
    type: CompanyType | 'ALL',
    dateDebut: Date,
    dateFin: Date,
    lang: string = 'fr',
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
    const adjustedDateFin = new Date(dateFin);
    adjustedDateFin.setDate(adjustedDateFin.getDate() + 1);
    const whereConditions: string[] = [];
    const whereParams: any = { start: dateDebut, end: adjustedDateFin };
    whereConditions.push('order.createdAt BETWEEN :start AND :end');
    whereConditions.push('order.status != :rejected');
    whereParams.rejected = OrderStatus.REJECTED;
    if (type && type !== 'ALL') {
      whereConditions.push('order.type = :type');
      whereParams.type = type;
    }
    const whereClause = whereConditions.join(' AND ');
    const orders = await this.orderRepo.createQueryBuilder('order').where(whereClause, whereParams).getMany();

    const totalOrders = orders.length;
    const deliveredOrders = orders.filter(o => o.status === OrderStatus.DELIVERED);
    const totalSales = deliveredOrders.length;
    const totalRevenue = orders.reduce((acc, o) => acc + Number(o.totalAmount || 0), 0);
    const totalShippingFees = orders.reduce((acc, o) => acc + Number(o.shippingCost || 0), 0);

    const ordersByDay = await this.orderRepo
      .createQueryBuilder('order')
      .select('DATE(order.createdAt)', 'date')
      .addSelect('COUNT(order.id)', 'count')
      .addSelect('SUM(order.totalAmount)', 'amount')
      .where(whereClause, whereParams)
      .groupBy('DATE(order.createdAt)')
      .orderBy('DATE(order.createdAt)', 'ASC')
      .getRawMany();

    const revenueByDay = await this.orderRepo
      .createQueryBuilder('order')
      .select('DATE(order.createdAt)', 'date')
      .addSelect('SUM(order.totalAmount)', 'revenue')
      .addSelect('SUM(order.shippingCost)', 'shipping')
      .where(whereClause, whereParams)
      .groupBy('DATE(order.createdAt)')
      .orderBy('DATE(order.createdAt)', 'ASC')
      .getRawMany();

    const topProductsQueryBuilder = this.orderItemRepo
      .createQueryBuilder('oi')
      .innerJoin('oi.product', 'product')
      .innerJoin('oi.order', 'order')
      .select('product.name', 'name')
      .addSelect('product.id', 'productId')
      .addSelect('SUM(oi.quantity)', 'count')
      .addSelect('SUM(oi.quantity * oi.price)', 'amount')
      .where('order.createdAt BETWEEN :start AND :end', { start: dateDebut, end: adjustedDateFin });
    if (type && type !== 'ALL') topProductsQueryBuilder.andWhere('order.type = :type', { type });
    const topProducts = await topProductsQueryBuilder.groupBy('product.id, product.name').orderBy('count', 'DESC').limit(10).getRawMany();

    const totalProductsQueryBuilder = this.productRepo.createQueryBuilder('product').select('COUNT(product.id)', 'count');
    if (type && type !== 'ALL') totalProductsQueryBuilder.innerJoin('product.company', 'company').where('company.typeCompany = :type', { type });
    totalProductsQueryBuilder.andWhere('product.createdAt BETWEEN :start AND :end', { start: dateDebut, end: adjustedDateFin });
    const totalProductsResult = await totalProductsQueryBuilder.getRawOne();
    const totalProducts = parseInt(totalProductsResult?.count || 0);

    const totalUsers = await this.userRepository.count({ where: { createdAt: Between(dateDebut, adjustedDateFin) } });
    const totalCompaniesWhere: any = { createdAt: Between(dateDebut, adjustedDateFin) };
    if (type && type !== 'ALL') totalCompaniesWhere.typeCompany = type;
    const totalCompanies = await this.companyRepo.count({ where: totalCompaniesWhere });

    return {
      message: this.i18nService.translate('dashboard.data_fetched_success', lang),
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

  // ======================== ANNULATION DE COMMANDE (UNIQUEMENT PENDING) ========================
  async cancelOrder(
    orderId: string,
    user: UserEntity,
    cancelDto: CancelOrderDto,
    langHeader?: string,
  ): Promise<{ message: string; data: OrderEntity }> {
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: [
        'user',
        'orderItems',
        'orderItems.product',
        'subOrders',
        'subOrders.items',
        'subOrders.items.product',
      ],
    });

    if (!order) {
      const lang = langHeader || 'fr';
      throw new NotFoundException(this.i18nService.translate('order.order_not_found_by_id', lang, { orderId }));
    }

    const lang = langHeader || this.getUserLanguage(order.user);

    // Vérifier que l'utilisateur est bien le propriétaire de la commande
    if (order.user.id !== user.id) {
      throw new ForbiddenException(this.i18nService.translate('order.cannot_cancel_others_order', lang));
    }

    // Vérifier que la commande est bien en statut PENDING
    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException(
        this.i18nService.translate('order.cannot_cancel_order_only_pending', lang, {
          status: order.status,
        }),
      );
    }

    // Enregistrer la raison et la date d'annulation
    order.cancellationReason = cancelDto.reason || undefined;
    order.cancelledAt = new Date();
    order.status = OrderStatus.REJECTED;
    order.rejectedBy = user;
    order.rejectedAt = new Date();

    // Mettre à jour les sous-commandes
    if (order.subOrders?.length) {
      for (const subOrder of order.subOrders) {
        subOrder.status = OrderStatus.REJECTED;
        await this.subOrderRepo.save(subOrder);
      }
    }

    const updatedOrder = await this.orderRepo.save(order);

    // Envoyer les notifications d'annulation
    await this.processOrderCancellation(order, cancelDto.reason, lang).catch((err) =>
      console.error('Erreur notifications annulation commande:', err),
    );

    return {
      message: this.i18nService.translate('order.order_cancelled_success', lang, {
        orderId: order.invoiceNumber,
      }),
      data: updatedOrder,
    };
  }

  // ======================== NOTIFICATIONS D'ANNULATION ========================
  private async processOrderCancellation(
    order: OrderEntity,
    reason: string | undefined,
    lang: string = 'fr',
  ): Promise<void> {
    try {
      let imageUrl: string | undefined;
      if (order.orderItems?.length) {
        const firstItem = order.orderItems[0];
        if (firstItem.product?.images?.length) imageUrl = firstItem.product.images[0].url;
        else if (firstItem.product?.image) imageUrl = firstItem.product.image;
      }

      const hasEmail = order.user.email && order.user.email.trim() !== '';
      const hasPhone = order.user.phone && order.user.phone.trim() !== '';

      // Notification push à l'utilisateur
      await this.pushNotificationHelper.sendAll({
        userId: order.user.id,
        pushTitle: this.i18nService.translate('order.push_order_cancelled_title', lang),
        pushBody: this.i18nService.translate('order.push_order_cancelled_body', lang, {
          invoiceNumber: order.invoiceNumber,
          reason: reason || this.i18nService.translate('order.no_reason_provided', lang),
        }),
        pushData: { entity: 'ORDER', entityId: order.id },
        phoneNumber: hasPhone ? order.user.phone : undefined,
        smsBody: hasPhone
          ? this.i18nService.translate('order.sms_order_cancelled', lang, {
            invoiceNumber: order.invoiceNumber,
            reason: reason || this.i18nService.translate('order.no_reason_provided', lang),
          })
          : undefined,
        imageUrl,
      });

      // Notification in-app
      await this.notificationHelpers.sendNotification(
        this.notificationsService,
        order.user.id,
        NotificationType.ORDER_UPDATED,
        lang,
        {
          invoiceNumber: order.invoiceNumber,
          status: OrderStatus.REJECTED,
          reason: reason || null,
        },
        'ORDER',
        order.id,
      );

      // Envoyer un email si disponible
      if (hasEmail) {
        const emailTranslations = {
          cancelled: this.i18nService.translate('order.email.cancelled', lang),
          order_number: this.i18nService.translate('order.email.order_number', lang),
          reason_label: this.i18nService.translate('order.email.reason', lang),
          need_help: this.i18nService.translate('order.email.need_help', lang),
          contact_support: this.i18nService.translate('order.email.contact_support', lang),
          thank_you: this.i18nService.translate('order.email.thank_you', lang),
        };

        await this.mailService.sendHtmlEmail(
          order.user.email,
          this.i18nService.translate('order.email.order_cancelled_subject', lang, {
            invoiceNumber: order.invoiceNumber,
          }),
          'order-cancelled.ejs',
          {
            data: {
              invoiceNumber: order.invoiceNumber,
              reason: reason || this.i18nService.translate('order.no_reason_provided', lang),
              order,
              user: order.user,
              year: new Date().getFullYear(),
              translations: emailTranslations,
              lang,
            },
          } as any,
        );
      }

      // Notifier les admins et les plateformes
      const platformUsers = await this.userPlatformRoleRepo.find({
        where: { platform: { key: order.type } },
        relations: ['user'],
      });
      const superAdmins = await this.userRepository.find({ where: { role: UserRole.SUPER_ADMIN } });
      const allRecipients = [...platformUsers.map(p => p.user), ...superAdmins].filter(
        (u, i, self) => u && i === self.findIndex(x => x.id === u.id),
      );

      for (const recipient of allRecipients) {
        await this.notificationsService.sendNotificationToUser(
          recipient.id,
          this.i18nService.translate('order.order_cancelled_title', lang),
          this.i18nService.translate('order.order_cancelled_detail', lang, {
            invoiceNumber: order.invoiceNumber,
            reason: reason || this.i18nService.translate('order.no_reason_provided', lang),
            clientName: order.user.fullName || order.user.email,
          }),
          order.type as any,
          order,
        );
      }

      console.log(`[processOrderCancellation] Commande ${order.invoiceNumber} annulée avec succès`);
    } catch (error) {
      console.error('Erreur dans processOrderCancellation:', error);
    }
  }
}