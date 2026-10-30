/* eslint-disable @typescript-eslint/no-unused-vars */
import { ListingType } from 'src/products/enum/listing-type.enum';
import { OrderNotificationHelper } from 'src/notification/utils/order-notification.helper';
import { OrderCallService } from './order-call.service';
import { UserPaymentMethodsService } from 'src/users/payment-methods/user-payment-methods.service';
import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Brackets, In, Repository } from 'typeorm';
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
import { BranchDeliveryService } from './branch-delivery.service';
import { ItemAvailabilityStatus, availabilityRequiredFor } from './enum/availability-status.enum';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { CompanyHasUserResource } from 'src/company_has_usrResource/entities/company_has_userResource.entity';
import { Resource } from 'src/ressource/entity/resource.entity';
import { City } from 'src/company/entities/city.entity';
import { FpayService } from 'src/fpay/fpay.service';
import { randomBytes } from 'crypto';
import { PayOrderDto } from './dto/pay-order.dto';
import { FpaySendDto } from 'src/fpay/dto/send.dto';
import { ReferralEntity, ReferralStatus } from 'src/users/entities/referral.entity';
import { NotificationsGateway } from 'src/notification/notifications.gateway';
import { SmsService } from 'src/users/utility/sms/sms.service';
import { SmsCategory } from 'src/users/utility/sms/entity/sms-recharge.entity';
import { SmsQuotaService } from 'src/users/utility/sms/sms-quota.service';
import {
  OrderItemSelection,
  ProductAttributeService,
} from 'src/AttributGlobal/product-attribute.service';

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

function noteOrStatusMessage(status: OrderStatus): string {
  const messages: Record<OrderStatus, string> = {
    [OrderStatus.PENDING]: 'Commande en attente',
    [OrderStatus.VALIDATED]: 'Commande validée',
    [OrderStatus.PROCESSING]: 'Commande en cours de traitement',
    [OrderStatus.COMPLETED]: 'Commande complétée',
    [OrderStatus.DELIVERED]: 'Commande livrée',
    [OrderStatus.REJECTED]: 'Commande rejetée',
  };
  return messages[status] ?? `Statut changé vers ${status}`;
}

/** ✅ Notifications de commande au personnel : seulement dans les back-offices (admin, group) */
const ORDER_STAFF_CHANNELS = (process.env.ORDER_STAFF_NOTIFICATION_CHANNELS || 'admin,group')
  .split(',')
  .map((c) => c.trim().toLowerCase())
  .filter(Boolean);

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
    // ✅ Livreurs par branche : notification des nouvelles commandes restaurant + affectation au traitement
    @Inject(forwardRef(() => BranchDeliveryService)) private readonly branchDelivery: BranchDeliveryService,
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
    private readonly pushNotificationHelper: PushNotificationHelper,
    // ✅ Nouvelle commande : notification Firebase sous forme d'appel
    private readonly orderCalls: OrderCallService,
    // ✅ Moyens de paiement enregistrés par l'utilisateur (paymentMethodId)
    private readonly userPaymentMethods: UserPaymentMethodsService,
    @InjectRepository(OperationEntity) private readonly operationRepo: Repository<OperationEntity>,

    private readonly permissionHelper: PermissionHelper,
    private readonly i18nService: I18nService,
    private readonly fpayService: FpayService,
    @InjectRepository(CompanyHasUserResource) private readonly companyHasUserResourceRepo: Repository<CompanyHasUserResource>,
    @InjectRepository(ReferralEntity)
    private readonly referralRepo: Repository<ReferralEntity>,

    @Inject(forwardRef(() => NotificationsGateway))
    private readonly notificationsGateway: NotificationsGateway,

    private readonly smsService: SmsService,
    private readonly smsQuotaService: SmsQuotaService,
    private readonly productAttributeService: ProductAttributeService, // ✅ variations / attributs choisis
  ) { }

  private getUserLanguage(user: UserEntity): string {
    const lang = user.settings?.language || 'fr';
    const supported = ['fr', 'en', 'sw', 'es', 'ar'];
    return supported.includes(lang) ? lang : 'fr';
  }

  /**
   * ✅ Vérifie le quota SMS ORDER sans jamais bloquer le traitement métier.
   * Un retour `false` indique juste que le SMS ne sera pas envoyé.
   */
  private async consumeSmsQuota(
    referenceId: string | undefined,
    referenceType: string,
    // ✅ Numéro du destinataire : le quota de SON pays est décompté
    phone?: string | null,
  ): Promise<boolean> {
    try {
      const result = await this.smsQuotaService.tryConsume(SmsCategory.ORDER, 1, phone);
      if (!result.allowed) {
        console.warn(
          `[Order] Quota SMS ORDER épuisé (remaining: ${result.quotaBefore}) -> SMS non envoyé [${referenceType}]`,
        );
        return false;
      }
      console.log(
        `[Order] Quota décompté (avant: ${result.quotaBefore}, après: ${result.quotaAfter}) [${referenceType}]`,
      );
      return true;
    } catch (error: any) {
      console.error(`[Order] Erreur quota SMS (ignorée):`, error?.message);
      return false;
    }
  }
  /**
 * 🔄 Renomme `deliveryAssignments` → `courier` dans la réponse
 * et retire les données sensibles (password) du livreur.
 */


  private async generateReferralCode(
    userId: string,
    existingCodes?: string[],
  ): Promise<string> {
    const userIdShort = userId.substring(0, 4).toUpperCase();

    // ✅ Générer un code aléatoire
    let code: string;
    let exists = true;
    let attempts = 0;
    const maxAttempts = 10;

    // ✅ Liste des codes à vérifier
    const codesToCheck = existingCodes || [];

    do {
      // Générer une partie aléatoire
      const random = Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase()
        .padStart(6, '0');

      code = `${userIdShort}${random}`; // ✅ Sans REF et sans tirets

      // Vérifier si le code existe déjà
      const existingUser = await this.userRepository.findOne({
        where: { referralCode: code },
      });

      exists = !!existingUser || codesToCheck.includes(code);
      attempts++;

    } while (exists && attempts < maxAttempts);

    // ✅ Fallback si jamais collision après 10 tentatives
    if (exists) {
      const timestamp = Date.now().toString(36).toUpperCase();
      const randomSuffix = Math.random()
        .toString(36)
        .substring(2, 4)
        .toUpperCase();
      code = `${timestamp.slice(-6)}${randomSuffix}`; // ✅ Sans REF et sans tirets

      // Vérifier une dernière fois le fallback
      const existingUser = await this.userRepository.findOne({
        where: { referralCode: code },
      });

      if (existingUser) {
        // Fallback ultime avec UUID
        const uuidPart = uuidv4().substring(0, 8).toUpperCase();
        code = `${uuidPart}`; // ✅ Sans REF et sans tirets
      }
    }

    return code;
  }

  async createOrder(
    createOrderDto: CreateOrderDto,
    user: UserEntity,
    signal?: AbortSignal,
    langHeader?: string,
  ): Promise<OrderEntity> {
    // ✅ Moyen de paiement enregistré : mode, opérateur et numéro remplis depuis le profil de l'utilisateur
    await this.userPaymentMethods.applyTo(createOrderDto, user.id, langHeader || this.getUserLanguage(user));

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
      pin,
    } = createOrderDto;

    const lang = langHeader || this.getUserLanguage(user);

    // ✅ VALIDATION DES DEVISES ACCEPTÉES
    const acceptedCurrencies = ['USD', 'CDF', 'XAF', 'XOF'];
    if (currency && !acceptedCurrencies.includes(currency)) {
      throw new BadRequestException(
        `Devise non supportée. Devises acceptées: ${acceptedCurrencies.join(', ')}`
      );
    }

    if (signal?.aborted) {
      throw new BadRequestException(this.i18nService.translate('order.order_request_aborted', lang));
    }

    const hasEmailCurrentUser = user.email && user.email.trim() !== '';
    const hasPhoneCurrentUser = user.phone && user.phone.trim() !== '';

    // ============================================================
    // ✅ NOUVEAU : si pas de phone mais whatsapp_number fourni
    //    → mise à jour automatique du profil
    // ============================================================
    if (!hasPhoneCurrentUser && whatsapp_number && whatsapp_number.trim() !== '') {
      console.log(
        `📱 [createOrder] User ${user.id} sans phone → mise à jour avec whatsapp_number: ${whatsapp_number}`,
      );

      try {
        user.phone = whatsapp_number.trim();
        await this.userRepository.save(user);
        console.log(`✅ [createOrder] Phone du user mis à jour: ${user.phone}`);
      } catch (err: any) {
        console.error(`⚠️ [createOrder] Impossible de mettre à jour le phone: ${err.message}`);
      }
    }

    if (!hasEmailCurrentUser && !hasPhoneCurrentUser && !whatsapp_number) {
      throw new BadRequestException(this.i18nService.translate('order.profile_incomplete', lang));
    }

    const addressUser = await this.addressUserRepo.findOne({ where: { id: addressUserId } });
    if (!addressUser) {
      throw new NotFoundException(this.i18nService.translate('order.address_not_found', lang));
    }

    // ============================================================
    // ✅ VARIATIONS / ATTRIBUTS CHOISIS
    //    Vérifiés AVANT tout paiement : une erreur ici ne débite jamais le client.
    // ============================================================
    const itemSelections: OrderItemSelection[] = [];
    for (const item of orderItems) {
      const product = await this.productRepo.findOne({ where: { id: item.productId } });
      if (!product) {
        throw new NotFoundException(
          this.i18nService.translate('order.product_not_found', lang, { productId: item.productId }),
        );
      }
      // ✅ AJOUT : une annonce (type Jiji) ne se commande pas — contact direct avec l'annonceur
      if (product.listingType === ListingType.CLASSIFIED) {
        throw new BadRequestException(
          this.i18nService.translate('order.classified_not_orderable', lang, { productName: product.name }),
        );
      }
      itemSelections.push(
        await this.productAttributeService.resolveOrderItemSelection(
          this.productRepo.manager,
          product,
          item,
          lang,
        ),
      );
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
    let fpayTransactionId: string | null = null;
    let fpayReference: string | null = null;

    // ✅ Vérifier si l'utilisateur a un parrain
    const userWithReferrer = await this.userRepository.findOne({
      where: { id: user.id },
      relations: ['referrer'],
    });

    console.log(`🔍 ========== DEBUG PARRAINAGE ==========`);
    console.log(`🔍 user.id: ${user.id}`);
    console.log(`🔍 user.referredBy: ${user.referredBy}`);
    console.log(`🔍 userWithReferrer.referrer: ${userWithReferrer?.referrer?.id || 'null'}`);
    console.log(`🔍 userWithReferrer.referrer?.fullName: ${userWithReferrer?.referrer?.fullName || 'null'}`);
    console.log(`🔍 hasReferrer: ${!!(userWithReferrer?.referrer)}`);
    console.log(`🔍 =========================================`);
    const hasReferrer = !!(userWithReferrer?.referrer);

    // ✅ Calcul du shippingCost, transactionFee et du montant total
    const shippingCostValue = Number(shippingCost || 0);
    const transactionFeeValue = Number(transactionFee || 0);
    const totalAmountValue = Number(totalAmount) + shippingCostValue + Number(transactionFeeValue);
    let parrainageAmount = 0;
    let paymentAmount = totalAmountValue;

    // ✅ Si l'utilisateur a un parrain → 10% du shippingCost pour le parrainage
    if (hasReferrer && shippingCostValue > 0) {
      parrainageAmount = shippingCostValue * 0.10;
      paymentAmount = totalAmountValue - parrainageAmount;

      console.log(`[Order] 👤 A un parrain: ${hasReferrer}`);
      console.log(`[Order] Total: ${totalAmountValue}$`);
      console.log(`[Order] 10% shipping pour parrainage: ${parrainageAmount}$`);
      console.log(`[Order] Montant du paiement: ${paymentAmount}$`);
    } else {
      console.log(`[Order] ℹ️ Aucun parrain trouvé`);
      console.log(`[Order] Montant du paiement: ${totalAmountValue}$`);
    }

    // ✅ Déterminer la devise par défaut (USD si non spécifiée)
    const orderCurrency = currency || 'USD';

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

        const finalGrandTotal = totalAmount + (shippingCost || 0) + Number(transactionFeeValue);

        if (!finalGrandTotal || finalGrandTotal <= 0) {
          throw new BadRequestException(
            this.i18nService.translate('order.mobile_money_grandtotal_required', lang)
          );
        }

        const amountForPawapay = finalGrandTotal.toString();

        const pawapayData = {
          amount: amountForPawapay,
          currency: orderCurrency,
          provider,
          phone: phon
        };
        console.log('[Order] Création dépôt Pawapay :', pawapayData);

        try {
          const pawapayResponse = await this.pawapayService.createDepositSimple(pawapayData, signal);
          console.log('[Order] Réponse Pawapay :', JSON.stringify(pawapayResponse, null, 2));

          const depositStatus = pawapayResponse.finalStatus?.data?.status;
          const failureReason = pawapayResponse.finalStatus?.data?.failureReason;
          const lastStatus = pawapayResponse.finalStatus?.data?.lastStatus;
          console.log(`[Order] Statut final Pawapay: ${depositStatus}`);

          if (depositStatus === 'COMPLETED') {
            console.log('[Order] ✅ Dépôt Pawapay confirmé : COMPLETED');
            paymentStatus = PaymentStatus.PAID;
            orderStatus = OrderStatus.VALIDATED;
            isPaidByMobileMoney = true;
          } else if (depositStatus === 'REJECTED') {
            throw new BadRequestException({
              statusCode: HttpStatus.BAD_REQUEST,
              message: failureReason?.failureMessage || 'Le paiement a été rejeté.',
              code: failureReason?.failureCode || 'PAYMENT_REJECTED',
              provider: pawapayData.provider,
            });
          } else if (depositStatus === 'FAILED') {
            throw new BadRequestException({
              statusCode: HttpStatus.BAD_REQUEST,
              message: failureReason?.failureMessage || 'Le paiement a échoué.',
              code: failureReason?.failureCode || 'PAYMENT_FAILED',
              provider: pawapayData.provider,
            });
          } else if (depositStatus === 'CANCELED') {
            throw new BadRequestException({
              statusCode: HttpStatus.BAD_REQUEST,
              message: failureReason?.failureMessage || 'Le paiement a été annulé.',
              code: failureReason?.failureCode || 'PAYMENT_CANCELED',
              provider: pawapayData.provider,
            });
          } else if (depositStatus === 'EXPIRED') {
            throw new BadRequestException({
              statusCode: HttpStatus.BAD_REQUEST,
              message: failureReason?.failureMessage || 'Le paiement a expiré.',
              code: failureReason?.failureCode || 'PAYMENT_EXPIRED',
              provider: pawapayData.provider,
            });
          } else if (depositStatus === 'TIMEOUT') {
            console.log('[Order] ⏳ Timeout du polling');
            throw new BadRequestException({
              statusCode: HttpStatus.BAD_REQUEST,
              message: failureReason?.failureMessage || `Le paiement est en cours de traitement (${lastStatus}). Veuillez vérifier le statut plus tard.`,
              code: failureReason?.failureCode || 'POLLING_TIMEOUT',
              provider: pawapayData.provider,
              lastStatus: lastStatus,
            });
          } else if (depositStatus === 'ACCEPTED' || depositStatus === 'PENDING' || depositStatus === 'PROCESSING' || depositStatus === 'WAITING') {
            console.log(`[Order] Statut en attente: ${depositStatus}`);
            paymentStatus = PaymentStatus.PENDING;
            orderStatus = OrderStatus.PENDING;
            isPaidByMobileMoney = false;
            console.log(`[Order] Commande en attente de confirmation du paiement (${depositStatus})`);
          } else {
            throw new BadRequestException({
              statusCode: HttpStatus.BAD_REQUEST,
              message: failureReason?.failureMessage || `Statut de paiement inattendu: ${depositStatus}`,
              code: failureReason?.failureCode || 'UNEXPECTED_STATUS',
              provider: pawapayData.provider,
            });
          }

          if (paymentStatus === PaymentStatus.PAID) {
            try {
              console.log('[Order] Tentative paiement Favor Help...');
              const fpayResponse = await this.fpayService.payWithMobileMoney(
                paymentAmount,
                orderCurrency || 'USD',
                `Paiement de commande #${invoiceNumb}`,
                'MOBILE_MONEY',
                lang
              );

              if (fpayResponse?.data?.transaction?.status === 'SUCCESS') {
                fpayTransactionId = fpayResponse.data.transaction.id;
                fpayReference = fpayResponse.data.transaction.reference;
                console.log(`[Order] ✅ Paiement Favor Help réussi: ${paymentAmount} ${orderCurrency}`);
                console.log(`[Order] Paiement Favor Help réussi pour la commande #${invoiceNumb}`);
              } else {
                console.log('[Order] ⚠️ Paiement Favor Help échoué - statut:', fpayResponse?.data?.transaction?.status || 'inconnu');
              }
            } catch (error: any) {
              console.error('[Order] ❌ Erreur paiement Favor Help:', error.message);
            }
          }

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

      } else if (paymentMethod === PaymentMethod.FPAY) {
        selectedMethod = PaymentMethod.FPAY;

        const fpayData = {
          amount: paymentAmount,
          currency: orderCurrency || 'USD',
          description: `Paiement de commande #${invoiceNumb} pour ${user.fullName}`,
          access_token: createOrderDto.access_token as string,
        };

        console.log('[Order] Tentative de paiement FPAY :', {
          userId: user.id,
          amount: fpayData.amount,
          currency: fpayData.currency,
          invoiceNumb,
          hasAccessToken: !!fpayData.access_token,
          hasReferrer,
          parrainageAmount,
        });

        try {
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
          } else {
            console.log('[Order] ⚠️ Paiement FPAY échoué, commande en attente');
            paymentStatus = PaymentStatus.PENDING;
            orderStatus = OrderStatus.PENDING;
            isPaidByMobileMoney = false;
          }
        } catch (error: any) {
          console.error('[Order] ❌ Erreur FPAY:', error.message);
          throw new BadRequestException(
            error.message || this.i18nService.translate('order.payment_failed', lang)
          );
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

    // ✅ Disponibilité : chaque produit attend la confirmation de son propriétaire
    const itemAvailability = availabilityRequiredFor(type) ? ItemAvailabilityStatus.PENDING : null;

    const isRestaurantAutoPaid = type === CompanyType.RESTAURANT &&
      (selectedMethod === PaymentMethod.MOBILE_MONEY ||
        selectedMethod === PaymentMethod.CASH ||
        selectedMethod === PaymentMethod.FPAY);

    const order = this.orderRepo.create({
      user,
      totalAmount: Number(totalAmount),
      currency: orderCurrency,
      grandTotal: isRestaurantAutoPaid ? (grandTotal ?? Number(totalAmount) + (shippingCost ?? 0) + (transactionFee ?? 0)) : Number(totalAmount),
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

    for (const [itemIndex, item] of orderItems.entries()) {
      const selection = itemSelections[itemIndex];
      const product = await this.productRepo.findOne({ where: { id: item.productId }, relations: ['company'] });
      if (!product) {
        throw new NotFoundException(
          this.i18nService.translate('order.product_not_found', lang, { productId: item.productId }),
        );
      }
      const orderItem = this.orderItemRepo.create({
        order,
        product,
        quantity: item.quantity,
        price: item.price,
        // ✅ variation / attributs choisis
        variationId: selection?.variationId ?? null,
        sku: selection?.sku ?? null,
        variationLabel: selection?.variationLabel ?? null,
        attributesSnapshot: selection?.attributesSnapshot ?? null,
        availabilityStatus: itemAvailability, // ✅ en attente de confirmation du propriétaire
        selectedAttributes: this.productAttributeService.buildOrderItemAttributes(
          this.orderItemRepo.manager,
          order.id,
          selection?.attributesSnapshot ?? null,
        ),
      });
      orderItemEntities.push(orderItem);
      const companyId = product.company.id;
      if (!groupedByCompany.has(companyId)) {
        groupedByCompany.set(companyId, { companyId, items: [], total: 0 });
      }
      const group = groupedByCompany.get(companyId)!;
      const subOrderItem = this.subOrderItemRepo.create({
        product,
        quantity: item.quantity,
        price: item.price,
        // ✅ le vendeur voit la variation / les attributs choisis
        variationId: selection?.variationId ?? null,
        sku: selection?.sku ?? null,
        variationLabel: selection?.variationLabel ?? null,
        attributesSnapshot: selection?.attributesSnapshot ?? null,
      });
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
        'orderItems.variation', // ✅
        'orderItems.selectedAttributes', // ✅
        'subOrders',
        'subOrders.items.product.company',
        'subOrders.items.product.category',
        'subOrders.items.product.measure',
        'subOrders.company',
        'user',
        'addressUser',
        'deliveryAssignments',
        'deliveryAssignments.deliver',
        'deliveryAssignments.assignedBy',
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
      const operationAmount = isRestaurantAutoPaid ? (grandTotal ?? Number(totalAmount) + (shippingCost ?? 0) + (transactionFee ?? 0)) : Number(totalAmount);
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
      console.log(`[Order] Opération ${selectedMethod} enregistrée pour la commande ${order.invoiceNumber}`);
    }

    if (hasReferrer && parrainageAmount > 0 && paymentStatus === PaymentStatus.PAID) {
      console.log(`[Order] 👤 A un parrain: ${hasReferrer}`);
      console.log(`[Order] 10% shipping pour parrainage: ${parrainageAmount}$`);

      const sendDto: FpaySendDto = {
        amount: parrainageAmount,
        description: `Bonus parrainage (10%) - Achat de votre filleul, commande #${invoiceNumb}`,
        currency: orderCurrency || 'USD',
        countryCode: 'CD',
        paymentMethod: 'MOBILE_MONEY',
      };

      this.fpayService.makeSendparrainage(sendDto, user)
        .then(async (result) => {
          if (result && result.success) {
            console.log(`[Order] ✅ ${parrainageAmount} envoyé au compte Parrainage via FPay`);

            const referrerId = userWithReferrer?.referrer?.id;
            if (referrerId) {
              await this.updateReferralWithAmount(
                referrerId,
                user.id,
                parrainageAmount,
                invoiceNumb,
                orderCurrency
              );
            }
          } else if (result) {
            console.log(`[Order] ⚠️ Parrainage non envoyé: ${result.message}`);
          }
        })
        .catch(error => {
          console.error(`[Order] ❌ Erreur envoi parrainage:`, error.message);
        });

      console.log(`[Order] 📤 Envoi parrainage en cours (non bloquant)...`);
    } else if (parrainageAmount > 0) {
      console.log(`[Order] 👤 Sans parrain - Pas de parrainage envoyé`);
    }

    const paymentQrCode = await QRCode.toDataURL(finalOrder.invoiceNumber);
    this.processOrderNotifications(finalOrder, subOrders, user, order, paymentQrCode, groupedByCompany, provider, lang).catch((err) =>
      console.error('Erreur notifications:', err),
    );
    return finalOrder;
  }

  private async updateReferralWithAmount(
    referrerId: string,
    referredId: string,
    amount: number,
    invoiceNumber: string,
    currency?: string,
  ): Promise<void> {
    // ✅ UTILISER LA DEVISE DE LA COMMANDE (ou USD par défaut)
    const validCurrency = currency || 'USD';

    console.log(`📝 ========== UPDATE REFERRAL WITH AMOUNT ==========`);
    console.log(`📝 ReferrerId: ${referrerId}`);
    console.log(`📝 ReferredId: ${referredId}`);
    console.log(`📝 Amount: ${amount}`);
    console.log(`📝 InvoiceNumber: ${invoiceNumber}`);
    console.log(`📝 Currency reçue: ${currency}`);
    console.log(`📝 Currency utilisée: ${validCurrency}`);
    console.log(`📝 Timestamp: ${new Date().toISOString()}`);

    try {
      // ✅ Rechercher un parrainage existant avec la MÊME devise
      console.log(`📝 Recherche d'un parrainage avec:`);
      console.log(`📝   - referrerId: ${referrerId}`);
      console.log(`📝   - referredId: ${referredId}`);
      console.log(`📝   - currency: ${validCurrency}`);

      let referral = await this.referralRepo.findOne({
        where: {
          referrerId: referrerId,
          referredId: referredId,
          currency: validCurrency,
        },
      });

      console.log(`📝 Parrainage trouvé avec ${validCurrency}: ${referral ? 'OUI ✅' : 'NON ❌'}`);

      if (referral) {
        console.log(`📝 === PARRAINAGE EXISTANT ===`);
        console.log(`📝 ID: ${referral.id}`);
        console.log(`📝 rewardAmount: ${referral.rewardAmount}`);
        console.log(`📝 currency: ${referral.currency}`);
        console.log(`📝 status: ${referral.status}`);
        console.log(`📝 createdAt: ${referral.createdAt}`);
        console.log(`📝 completedAt: ${referral.completedAt}`);

        // ✅ Mise à jour du parrainage existant - ADDITION par devise
        const oldAmount = referral.rewardAmount;
        const newAmount = Number(referral.rewardAmount) + amount;

        console.log(`📝 Calcul: ${oldAmount} + ${amount} = ${newAmount}`);

        referral.rewardAmount = Number(referral.rewardAmount) + amount;
        referral.status = ReferralStatus.COMPLETED;
        referral.completedAt = new Date();

        referral.metadata = {
          ...referral.metadata,
          orderInvoice: invoiceNumber,
          rewardedAt: new Date().toISOString(),
          amount: amount,
          currency: validCurrency,
          totalAmount: newAmount,
          previousAmount: oldAmount,
        };

        await this.referralRepo.save(referral);
        console.log(`✅ Parrainage mis à jour pour ${referrerId}: ${oldAmount} + ${amount} = ${referral.rewardAmount} ${validCurrency} (COMPLETED) - Additionné ✅`);
        console.log(`📝 Nouveau total: ${referral.rewardAmount} ${validCurrency}`);
      } else {
        console.log(`📝 === AUCUN PARRAINAGE TROUVÉ ===`);
        console.log(`📝 Création d'un nouveau parrainage avec ${validCurrency}`);

        // ✅ Création d'un nouveau parrainage avec la devise de la commande
        const newReferral = this.referralRepo.create({
          referrerId: referrerId,
          referredId: referredId,
          referralCode: `${Date.now()}`,
          status: ReferralStatus.COMPLETED,
          rewardAmount: amount,
          currency: validCurrency,
          rewardType: 'POINTS',
          completedAt: new Date(),
          metadata: {
            orderInvoice: invoiceNumber,
            rewardedAt: new Date().toISOString(),
            amount: amount,
            currency: validCurrency,
            totalAmount: amount,
          },
        });

        await this.referralRepo.save(newReferral);
        console.log(`✅ Nouveau parrainage créé pour ${referrerId}: ${amount} ${validCurrency} récompensé (COMPLETED) ✅`);
        console.log(`📝 Nouvel ID: ${newReferral.id}`);
        console.log(`📝 Nouveau total: ${amount} ${validCurrency}`);
      }
    } catch (error) {
      console.error(`❌ Erreur lors de la mise à jour du parrainage:`);
      console.error(`❌ Message: ${error.message}`);
      console.error(`❌ Stack:`, error.stack);
    }

    console.log(`📝 ==============================================`);
  }
  // ======================== CRÉATION DE COMMANDE ========================

  async payPendingOrder(
    payOrderDto: PayOrderDto,
    user: UserEntity,
    signal?: AbortSignal,
    langHeader?: string,
  ): Promise<OrderEntity> {
    // ✅ Moyen de paiement enregistré (paymentMethodId)
    await this.userPaymentMethods.applyTo(payOrderDto, user.id, langHeader || this.getUserLanguage(user));
    const { orderId, paymentMethod, provider, phone, access_token, transactionFee, appliedFeeRate } = payOrderDto;
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

    // ✅ Vérifier si l'utilisateur a un parrain
    const userWithReferrer = await this.userRepository.findOne({
      where: { id: user.id },
      relations: ['referrer'],
    });

    const hasReferrer = !!(userWithReferrer?.referrer);

    // ✅ Calcul IDENTIQUE à createOrder
    const shippingCostValue = Number(order.shippingCost || 0);
    const transactionFeeValue = Number(transactionFee || 0);
    const totalAmountValue = Number(order.totalAmount) + shippingCostValue + transactionFeeValue;
    let parrainageAmount = 0;
    let paymentAmount = totalAmountValue;

    // ✅ Si l'utilisateur a un parrain → 10% du shippingCost pour le parrainage
    if (hasReferrer && shippingCostValue > 0) {
      parrainageAmount = shippingCostValue * 0.10;
      paymentAmount = totalAmountValue - parrainageAmount;

      console.log(`[PayOrder] 👤 A un parrain: ${hasReferrer}`);
      console.log(`[PayOrder] Total: ${totalAmountValue}$`);
      console.log(`[PayOrder] 10% shipping pour parrainage: ${parrainageAmount}$`);
      console.log(`[PayOrder] Montant du paiement: ${paymentAmount}$`);
    } else {
      console.log(`[PayOrder] ℹ️ Aucun parrain trouvé`);
      console.log(`[PayOrder] Montant du paiement: ${totalAmountValue}$`);
    }

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

      // ✅ IDENTIQUE à createOrder
      const finalGrandTotal = Number(order.totalAmount) + shippingCostValue + transactionFeeValue;

      if (!finalGrandTotal || finalGrandTotal <= 0) {
        throw new BadRequestException(
          this.i18nService.translate('order.mobile_money_grandtotal_required', lang)
        );
      }

      // ✅ Utiliser finalGrandTotal (IDENTIQUE à createOrder)
      const amountForPawapay = finalGrandTotal.toString();

      const pawapayData = {
        amount: amountForPawapay,
        currency: order.currency,
        provider,
        phone: phon
      };

      console.log('[PayOrder] Création dépôt Pawapay :', pawapayData);

      // ============================================================
      // 1. PAWAPAY - OBLIGATOIRE (IDENTIQUE à createOrder)
      // ============================================================
      try {
        const pawapayResponse = await this.pawapayService.createDepositSimple(pawapayData, signal);
        console.log('[PayOrder] Réponse Pawapay :', JSON.stringify(pawapayResponse, null, 2));

        const depositStatus = pawapayResponse.finalStatus?.data?.status;
        const failureReason = pawapayResponse.finalStatus?.data?.failureReason;
        const lastStatus = pawapayResponse.finalStatus?.data?.lastStatus;

        console.log(`[PayOrder] Statut final Pawapay: ${depositStatus}`);

        // ✅ Gestion IDENTIQUE à createOrder
        if (depositStatus === 'COMPLETED') {
          console.log('[PayOrder] ✅ Dépôt Pawapay confirmé : COMPLETED');
          paymentStatus = PaymentStatus.PAID;
          orderStatus = OrderStatus.VALIDATED;
          isPaidByMobileMoney = true;
        } else if (depositStatus === 'REJECTED') {
          throw new BadRequestException({
            statusCode: HttpStatus.BAD_REQUEST,
            message: failureReason?.failureMessage || 'Le paiement a été rejeté.',
            code: failureReason?.failureCode || 'PAYMENT_REJECTED',
            provider: pawapayData.provider,
          });
        } else if (depositStatus === 'FAILED') {
          throw new BadRequestException({
            statusCode: HttpStatus.BAD_REQUEST,
            message: failureReason?.failureMessage || 'Le paiement a échoué.',
            code: failureReason?.failureCode || 'PAYMENT_FAILED',
            provider: pawapayData.provider,
          });
        } else if (depositStatus === 'CANCELED') {
          throw new BadRequestException({
            statusCode: HttpStatus.BAD_REQUEST,
            message: failureReason?.failureMessage || 'Le paiement a été annulé.',
            code: failureReason?.failureCode || 'PAYMENT_CANCELED',
            provider: pawapayData.provider,
          });
        } else if (depositStatus === 'EXPIRED') {
          throw new BadRequestException({
            statusCode: HttpStatus.BAD_REQUEST,
            message: failureReason?.failureMessage || 'Le paiement a expiré.',
            code: failureReason?.failureCode || 'PAYMENT_EXPIRED',
            provider: pawapayData.provider,
          });
        } else if (depositStatus === 'TIMEOUT') {
          console.log('[PayOrder] ⏳ Timeout du polling');
          throw new BadRequestException({
            statusCode: HttpStatus.BAD_REQUEST,
            message: failureReason?.failureMessage || `Le paiement est en cours de traitement (${lastStatus}). Veuillez vérifier le statut plus tard.`,
            code: failureReason?.failureCode || 'POLLING_TIMEOUT',
            provider: pawapayData.provider,
            lastStatus: lastStatus,
          });
        } else if (['ACCEPTED', 'PENDING', 'PROCESSING', 'WAITING'].includes(depositStatus)) {
          console.log(`[PayOrder] ⏳ Statut en attente: ${depositStatus}`);
          paymentStatus = PaymentStatus.PENDING;
          orderStatus = OrderStatus.PENDING;
          isPaidByMobileMoney = false;
          console.log(`[PayOrder] Commande en attente de confirmation du paiement (${depositStatus})`);
        } else {
          throw new BadRequestException({
            statusCode: HttpStatus.BAD_REQUEST,
            message: failureReason?.failureMessage || `Statut de paiement inattendu: ${depositStatus}`,
            code: failureReason?.failureCode || 'UNEXPECTED_STATUS',
            provider: pawapayData.provider,
          });
        }

        // ============================================================
        // ✅ PAIEMENT FAVOR HELP AVEC payWithMobileMoney (IDENTIQUE à createOrder)
        // ============================================================
        if (paymentStatus === PaymentStatus.PAID) {
          try {
            console.log('[PayOrder] Tentative paiement Favor Help...');
            const fpayResponse = await this.fpayService.payWithMobileMoney(
              paymentAmount,  // ✅ paymentAmount (après parrainage)
              order.currency || 'USD',
              `Paiement de commande #${order.invoiceNumber}`,
              'MOBILE_MONEY',
              lang
            );

            if (fpayResponse?.data?.transaction?.status === 'SUCCESS') {
              fpayTransactionId = fpayResponse.data.transaction.id;
              fpayReference = fpayResponse.data.transaction.reference;
              console.log(`[PayOrder] ✅ Paiement Favor Help réussi: ${paymentAmount} ${order.currency}`);
              console.log(`[PayOrder] Paiement Favor Help réussi pour la commande #${order.invoiceNumber}`);
            } else {
              console.log('[PayOrder] ⚠️ Paiement Favor Help échoué - statut:', fpayResponse?.data?.transaction?.status || 'inconnu');
            }
          } catch (error: any) {
            console.error('[PayOrder] ❌ Erreur paiement Favor Help:', error.message);
          }
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

    } else if (paymentMethod === PaymentMethod.FPAY) {
      selectedMethod = PaymentMethod.FPAY;

      if (!access_token) {
        throw new BadRequestException(
          this.i18nService.translate('order.fpay_access_token_required', lang)
        );
      }

      if (isNaN(paymentAmount) || paymentAmount <= 0) {
        throw new BadRequestException('Le montant total est invalide');
      }

      const fpayData = {
        amount: paymentAmount,  // ✅ Montant après parrainage
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
        hasReferrer,
        parrainageAmount,
      });

      try {
        // ✅ 1. Paiement FPAY
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

          // ✅ 2. Créer la transaction de paiement
          const operationAmount = (Number(order.totalAmount) + Number(order.shippingCost || 0));
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

          const operation = this.operationRepo.create(operationData as any);
          await this.operationRepo.save(operation);
          console.log(`[PayOrder] Opération ${selectedMethod} enregistrée pour la commande ${order.invoiceNumber}`);

          // ============================================================
          // ✅ ENVOYER LE PARRAINAGE (10%) - UNIQUEMENT SI PARRAIN
          // ============================================================
          if (hasReferrer && parrainageAmount > 0) {
            console.log(`[PayOrder] 👤 A un parrain: ${hasReferrer}`);
            console.log(`[PayOrder] 10% shipping pour parrainage: ${parrainageAmount}$`);

            const sendDto: FpaySendDto = {
              amount: parrainageAmount,
              description: `Bonus parrainage (10%) - Achat de votre filleul, commande #${order.invoiceNumber}`,
              currency: order.currency || 'USD',
              countryCode: 'CD',
              paymentMethod: 'MOBILE_MONEY',
            };

            // ✅ Appel à makeSendparrainage (HELP → PARRAINAGE) - NON BLOQUANT
            this.fpayService.makeSendparrainage(sendDto, user)
              .then(async (result) => {
                if (result && result.success) {
                  console.log(`[PayOrder] ✅ ${parrainageAmount} envoyé au compte Parrainage via FPay`);

                  const referrerId = userWithReferrer?.referrer?.id;
                  if (referrerId) {
                    await this.updateReferralWithAmount(
                      referrerId,
                      user.id,
                      parrainageAmount,
                      order.invoiceNumber,
                      order.currency
                    );
                  }
                } else if (result) {
                  console.log(`[PayOrder] ⚠️ Parrainage non envoyé: ${result.message}`);
                }
              })
              .catch(error => {
                console.error('[PayOrder] ❌ Erreur envoi parrainage:', error.message);
              });

            console.log(`[PayOrder] 📤 Envoi parrainage en cours (non bloquant)...`);
          } else {
            console.log(`[PayOrder] 👤 Sans parrain - Pas de parrainage envoyé`);
          }
        } else {
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
    // ✅ PIN : envoyé seulement si CE paiement VALIDE la commande (paiement en ligne réussi = validation),
    //    et une seule fois (commande sans PIN). Commande déjà validée : son PIN est déjà parti → pas de renvoi.
    //    La facture payée, elle, part toujours (processPaymentNotifications).
    const wasValidated = this.isValidatedStage(order.status);
    const sendPinWithPayment =
      paymentStatus === PaymentStatus.PAID && orderStatus === OrderStatus.VALIDATED && !wasValidated && !order.pin;
    if (sendPinWithPayment) order.pin = GeneratePin.generate();
    order.paymentStatus = paymentStatus;
    order.status = orderStatus;
    order.paid = paymentStatus === PaymentStatus.PAID;
    order.paymentMethod = selectedMethod;
    // ✅ Frais de transaction envoyés par le front, enregistrés sur la commande (facture, back-office)
    order.transactionFee = transactionFeeValue;
    if (appliedFeeRate !== undefined && appliedFeeRate !== null) order.appliedFeeRate = Number(appliedFeeRate);
    order.grandTotal = totalAmountValue;

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

    // 9. Récupérer la commande mise à jour
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
        'deliveryAssignments',              // 🔥 AJOUT
        'deliveryAssignments.deliver',      // 🔥 AJOUT
        'deliveryAssignments.assignedBy',   // 🔥 AJOUT
      ],
    });

    if (!updatedOrder) {
      throw new NotFoundException(
        this.i18nService.translate('order.order_not_found_after_update', lang)
      );
    }

    // 10. NOTIFICATIONS
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
        lang,
        sendPinWithPayment,
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
    // ✅ true seulement quand ce paiement VALIDE la commande (le PIN part à la validation, pas au paiement)
    sendPin: boolean = false,
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
        unit: this.i18nService.translate('order.email.unit', lang),
        hour: this.i18nService.translate('order.email.hour', lang),
        payment_method: this.i18nService.translate('order.email.payment_method', lang),
        cash: this.i18nService.translate('order.email.cash', lang),
        total_ht: this.i18nService.translate('order.email.total_ht', lang),
        shipping_cost: this.i18nService.translate('order.email.shipping_cost', lang),
        vat: this.i18nService.translate('order.email.vat', lang),
        total_ttc: this.i18nService.translate('order.email.total_ttc', lang),
        notes_conditions: this.i18nService.translate('order.email.notes_conditions', lang),
        notes_line_1: this.i18nService.translate('order.email.notes_line_1', lang),
        notes_line_2: this.i18nService.translate('order.email.notes_line_2', lang),
        thank_you_footer: this.i18nService.translate('order.email.thank_you_footer', lang),
        legal_line_1: this.i18nService.translate('order.email.legal_line_1', lang),
        legal_line_2: this.i18nService.translate('order.email.legal_line_2', lang),
        legal_line_3: this.i18nService.translate('order.email.legal_line_3', lang),
      };

      const notificationOptions: any = {
        userId: user.id,
        pushTitle: this.i18nService.translate(sendPin ? 'order.push_order_paid_title' : 'order.push_order_payment_received_title', lang),
        pushBody: sendPin
          ? this.i18nService.translate('order.push_order_paid_body', lang, { invoiceNumber: order.invoiceNumber, pin: order.pin })
          : this.i18nService.translate('order.push_order_payment_received_body', lang, { invoiceNumber: order.invoiceNumber }),
        pushData: { entity: 'ORDER', entityId: finalOrder.id },
        imageUrl,
      };

      // ✅ SMS / WhatsApp avec le PIN : seulement si ce paiement valide la commande
      if (hasPhone && sendPin) {
        const allowed = await this.consumeSmsQuota(finalOrder.id, 'ORDER_PAID', user.phone);
        if (allowed) {
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
        } else {
          console.warn(`[Order] SMS ORDER_PAID bloqué (quota épuisé) pour ${user.phone}`);
        }
      }

      if (hasEmail) {
        notificationOptions.emailTo = user.email;
        notificationOptions.emailSubject = this.i18nService.translate('order.paid_invoice_subject', lang);
        notificationOptions.emailContext = {
          user: user,
          order: order,
          subOrders: subOrders,
          paymentQrCode: paymentQrCode,
          translations: emailTranslations,
          lang: lang,
          subOrdersHtml: this.mailService.generateSubOrdersByInvoiceNumberHtml(subOrders, order.currency),
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

      // ✅ Administrateurs CONCERNÉS seulement : ceux de la ville de la commande (ou responsables globaux)
      const resourceName = this.permissionHelper.getOrderResourceByCompanyType(finalOrder.type);
      const { cityIds: orderCityIds, cityName: orderCityName } = await this.orderCities(subOrders);
      const recipients = await this.orderStaffRecipients(resourceName, orderCityIds, user.id);
      console.log(`👥 Commande payée ${finalOrder.invoiceNumber} : ${recipients.length} administrateur(s) concerné(s) (${orderCityName || 'ville inconnue'})`);

      // ✅ Administrateurs : paiement reçu, SANS le PIN du client
      const paidTitle = this.i18nService.translate('order.push_order_payment_received_title', lang);
      const paidBody = this.i18nService.translate('order.push_order_payment_received_body', lang, {
        invoiceNumber: finalOrder.invoiceNumber,
      });
      for (const admin of recipients) {
        await this.notificationsService.sendAndSaveNotification(
          admin.id,
          paidTitle,
          paidBody,
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
          },
          // ✅ Seulement dans les back-offices (pas dans l'application client de l'administrateur)
          { channels: ORDER_STAFF_CHANNELS },
        );
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
        unit: this.i18nService.translate('order.email.unit', lang),
        hour: this.i18nService.translate('order.email.hour', lang),
        payment_method: this.i18nService.translate('order.email.payment_method', lang),
        cash: this.i18nService.translate('order.email.cash', lang),
        total_ht: this.i18nService.translate('order.email.total_ht', lang),
        shipping_cost: this.i18nService.translate('order.email.shipping_cost', lang),
        vat: this.i18nService.translate('order.email.vat', lang),
        total_ttc: this.i18nService.translate('order.email.total_ttc', lang),
        notes_conditions: this.i18nService.translate('order.email.notes_conditions', lang),
        notes_line_1: this.i18nService.translate('order.email.notes_line_1', lang),
        notes_line_2: this.i18nService.translate('order.email.notes_line_2', lang),
        thank_you_footer: this.i18nService.translate('order.email.thank_you_footer', lang),
        legal_line_1: this.i18nService.translate('order.email.legal_line_1', lang),
        legal_line_2: this.i18nService.translate('order.email.legal_line_2', lang),
        legal_line_3: this.i18nService.translate('order.email.legal_line_3', lang),
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
          const allowed = await this.consumeSmsQuota(finalOrder.id, 'ORDER_VALIDATED', user.phone);
          if (allowed) {
            notificationOptions.phoneNumber = user.phone;
            notificationOptions.smsBody = this.i18nService.translate('order.sms_order_validated', lang, {
              invoiceNumber: order.invoiceNumber,
              shippingCost: order.shippingCost,
              currency: order.currency,
              pin: order.pin,
            });
          } else {
            console.warn(`[Order] SMS ORDER_VALIDATED bloqué (quota épuisé) pour ${user.phone}`);
          }
        }
      } else {
        notificationOptions.pushTitle = this.i18nService.translate('order.push_order_pending_title', lang);
        notificationOptions.pushBody = this.i18nService.translate('order.push_order_pending_body', lang, {
          invoiceNumber: order.invoiceNumber,
        });
        if (hasPhone) {
          const allowed = await this.consumeSmsQuota(finalOrder.id, 'ORDER_PENDING', user.phone);
          if (allowed) {
            notificationOptions.phoneNumber = user.phone;
            notificationOptions.smsBody = this.i18nService.translate('order.sms_order_pending', lang, {
              invoiceNumber: order.invoiceNumber,
              totalAmount: order.totalAmount,
              currency: order.currency,
            });
          } else {
            console.warn(`[Order] SMS ORDER_PENDING bloqué (quota épuisé) pour ${user.phone}`);
          }
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

      // ✅ Ville(s) de la commande (toutes les boutiques concernées)
      const { cityIds: orderCityIds, cityName: orderCityName } = await this.orderCities(subOrders);
      console.log(`🏙️ Ville(s) de la commande : ${orderCityName || 'inconnue'} (${orderCityIds.join(', ')})`);

      const processedRecipients = new Set<string>([user.id]);

      // 🛍️ NOTIFIER LE(S) PROPRIÉTAIRE(S) DE CHAQUE BOUTIQUE CONCERNÉE
      await this.notifyShopOwnersOfNewOrder(finalOrder, groupedByCompany, user, processedRecipients);

      // ✅ Administrateurs CONCERNÉS seulement : ville de la commande + permission sur ce type de commande
      //    (+ responsables globaux, + super admins si ORDER_NOTIFY_SUPER_ADMINS=true)
      const staff = await this.orderStaffRecipients(resourceName, orderCityIds, user.id);
      const superAdminIds = new Set(staff.filter((u) => u.role === UserRole.SUPER_ADMIN).map((u) => u.id));
      const createdTitle = this.i18nService.translate('order.push_order_created_title', lang);
      const createdBody = this.i18nService.translate('order.push_order_created_body', lang, {
        invoiceNumber: finalOrder.invoiceNumber,
        totalAmount: finalOrder.totalAmount,
        currency: finalOrder.currency,
      });
      console.log(`👥 Nouvelle commande ${finalOrder.invoiceNumber} : ${staff.length} administrateur(s) concerné(s)`);

      // 🚚 Livreurs de la BRANCHE (ville du restaurant) ayant une permission sur les commandes restaurant
      void this.branchDelivery.notifyNewOrder(finalOrder, orderCityIds, orderCityName, lang, [user.id]);

      for (const admin of staff) {
        if (processedRecipients.has(admin.id)) continue;
        processedRecipients.add(admin.id);

        // ✅ Une seule notification (WebSocket + enregistrée), seulement dans les back-offices
        await this.notificationsService.sendAndSaveNotification(
          admin.id,
          createdTitle,
          createdBody,
          finalOrder.type as any,
          {
            orderId: finalOrder.id,
            invoiceNumber: finalOrder.invoiceNumber,
            totalAmount: finalOrder.totalAmount,
            currency: finalOrder.currency,
            type: finalOrder.type,
            city: orderCityName,
          },
          { channels: ORDER_STAFF_CHANNELS },
        );

        // ✅ Firebase sous forme d'APPEL (sonnerie) : admins de la ville (ORDER_CALL_ADMINS) / super admins (ORDER_CALL_SUPER_ADMINS)
        const isSuper = superAdminIds.has(admin.id);
        if ((isSuper && this.orderCalls.ringSuperAdmins) || (!isSuper && this.orderCalls.ringAdmins)) {
          await this.orderCalls.ring([admin.id], finalOrder.id, createdTitle, createdBody, {
            action: 'NEW_ORDER',
            invoiceNumber: finalOrder.invoiceNumber,
            orderType: finalOrder.type,
            city: orderCityName ?? '',
          });
        }
      }

      console.log('✅ [processOrderNotifications] Terminé');
    } catch (error) {
      console.error('❌ Erreur dans processOrderNotifications:', error);
    }
  }
  /** ✅ Villes des boutiques d'une commande (une commande peut concerner plusieurs boutiques) */
  private async orderCities(subOrders: SubOrderEntity[]): Promise<{ cityIds: string[]; cityName: string | null }> {
    const cityIds = [...new Set((subOrders || []).map((so) => so.company?.cityId).filter((id): id is string => !!id))];
    if (!cityIds.length) return { cityIds, cityName: null };
    const cities = await this.cityRepo.find({ where: { id: In(cityIds) } });
    return { cityIds, cityName: cities.map((c) => c.name).filter(Boolean).join(', ') || null };
  }

  /**
   * ✅ Personnel CONCERNÉ par une commande (logique d'envoi) :
   *  1. administrateurs (rôle ADMIN, compte actif) ayant une permission sur les commandes de CE type
   *     (ORDERS_SHOP, ORDERS_RESTAURANT…) :
   *       • rattachés à une branche de la VILLE de la commande (lecture ou gestion),
   *       • ou responsables globaux : permission « gestion » sans branche (ORDER_NOTIFY_GLOBAL_ADMINS, défaut true) ;
   *     ➜ les administrateurs des autres villes ne reçoivent plus rien ;
   *  2. super admins si ORDER_NOTIFY_SUPER_ADMINS=true (défaut true) ;
   *  3. jamais l'acheteur lui-même.
   */
  private async orderStaffRecipients(resourceName: string, cityIds: string[], buyerId?: string): Promise<UserEntity[]> {
    const globalAdmins = String(process.env.ORDER_NOTIFY_GLOBAL_ADMINS ?? 'true').toLowerCase() !== 'false';
    const superAdmins = String(process.env.ORDER_NOTIFY_SUPER_ADMINS ?? 'true').toLowerCase() !== 'false';
    const out = new Map<string, UserEntity>();

    if (resourceName && (cityIds.length || globalAdmins)) {
      const qb = this.userRepository
        .createQueryBuilder('u')
        .innerJoin('user_has_company', 'uhc', 'uhc.userId = u.id')
        .innerJoin('company_has_user_resource', 'chur', 'chur.userCompanyId = uhc.id')
        .innerJoin('resources', 'r', 'r.id = chur.resourceId')
        .leftJoin('branches', 'b', 'b.id = chur.branchId')
        .where('u.role = :role', { role: UserRole.ADMIN })
        .andWhere('u.isActive = 1')
        .andWhere('r.name = :resourceName', { resourceName })
        .andWhere(
          new Brackets((w) => {
            if (cityIds.length) {
              w.where('(chur.branchId IS NOT NULL AND b.cityId IN (:...cityIds) AND (chur.canManage = 1 OR chur.canRead = 1))', { cityIds });
              if (globalAdmins) w.orWhere('(chur.branchId IS NULL AND chur.canManage = 1)');
            } else {
              w.where('(chur.branchId IS NULL AND chur.canManage = 1)');
            }
          }),
        );
      for (const u of await qb.distinct(true).getMany()) out.set(u.id, u);
    }

    if (superAdmins) {
      for (const u of await this.userRepository.find({ where: { role: UserRole.SUPER_ADMIN, isActive: true } })) out.set(u.id, u);
    }
    if (buyerId) out.delete(buyerId);
    return [...out.values()];
  }

  /**
   * Ressources "commandes" : un utilisateur qui a un droit sur l'une d'elles
   * dans la boutique reçoit aussi la notification de nouvelle commande.
   * Surchargeable avec ORDER_NOTIFY_RESOURCES (liste séparée par des virgules).
   */
  private getOrderNotifyResources(): string[] {
    const fromEnv = (process.env.ORDER_NOTIFY_RESOURCES || '')
      .split(',')
      .map((r) => r.trim().toUpperCase())
      .filter(Boolean);
    if (fromEnv.length) return fromEnv;
    return [
      'RESTAURANT.ORDER',
      'SHOP.ORDER',
      'GROCERY.ORDER',
      // anciens noms utilisés par PermissionHelper
      'ORDERS_RESTAURANT',
      'ORDERS_SHOP',
      'ORDERS_MARKET',
    ];
  }

  /**
   * 🛍️ Push + notification enregistrée aux responsables de chaque boutique
   * dont un produit vient d'être commandé :
   * - le propriétaire (user_has_company.isOwner = true)
   * - les utilisateurs qui ont une permission sur RESTAURANT.ORDER / SHOP.ORDER / GROCERY.ORDER
   *   dans cette boutique (lecture, création, modification, suppression ou gestion)
   * - à défaut des deux : les utilisateurs rattachés à la boutique
   * - l'acheteur n'est jamais notifié comme vendeur de sa propre commande
   * - ne bloque jamais la commande (toute erreur est seulement journalisée)
   */
  private async notifyShopOwnersOfNewOrder(
    finalOrder: OrderEntity,
    groupedByCompany: Map<string, { companyId: string; items: SubOrderItemEntity[]; total: number }>,
    buyer: UserEntity,
    processedRecipients: Set<string>,
  ): Promise<void> {
    try {
      const companyIds = Array.from(groupedByCompany.keys()).filter(Boolean);
      if (!companyIds.length) return;

      // Utilisateurs rattachés aux boutiques concernées
      const links: { userId: string; companyId: string; isOwner: number | string | boolean }[] =
        await this.userHasCompanyRepo
          .createQueryBuilder('uhc')
          .select('uhc.userId', 'userId')
          .addSelect('uhc.companyId', 'companyId')
          .addSelect('uhc.isOwner', 'isOwner')
          .where('uhc.companyId IN (:...companyIds)', { companyIds })
          .getRawMany();

      // Utilisateurs avec une permission "commandes" dans ces boutiques
      const resourceNames = this.getOrderNotifyResources();
      let permitted: { userId: string; companyId: string }[] = [];
      try {
        permitted = await this.userHasCompanyRepo
          .createQueryBuilder('uhc')
          .innerJoin(CompanyHasUserResource, 'chur', 'chur.userCompanyId = uhc.id')
          .innerJoin(Resource, 'r', 'r.id = chur.resourceId')
          .select('uhc.userId', 'userId')
          .addSelect('uhc.companyId', 'companyId')
          .where('uhc.companyId IN (:...companyIds)', { companyIds })
          .andWhere('UPPER(r.name) IN (:...resourceNames)', { resourceNames })
          .andWhere('chur.status = :active', { active: true })
          .andWhere(
            '(chur.canRead = :yes OR chur.canManage = :yes OR chur.canCreate = :yes OR chur.canUpdate = :yes OR chur.canDelete = :yes)',
            { yes: true },
          )
          .getRawMany();
      } catch (err: any) {
        console.error('[ShopOwner] Lecture des permissions impossible:', err?.message);
      }

      const ownersByCompany = new Map<string, string[]>();
      for (const companyId of companyIds) {
        const rows = links.filter((l) => l.companyId === companyId && l.userId);
        const owners = rows.filter((l) => Number(l.isOwner) === 1 || l.isOwner === true).map((l) => l.userId);
        const withPermission = permitted.filter((p) => p.companyId === companyId && p.userId).map((p) => p.userId);
        const recipients = [...owners, ...withPermission];
        // Ni propriétaire marqué ni permission : on prévient les utilisateurs de la boutique
        ownersByCompany.set(companyId, [...new Set(recipients.length ? recipients : rows.map((l) => l.userId))]);
        console.log(
          `🛍️ [ShopOwner] Boutique ${companyId} : ${owners.length} propriétaire(s), ${withPermission.length} utilisateur(s) avec permission`,
        );
      }

      const ownerIds = [...new Set(Array.from(ownersByCompany.values()).flat())].filter(
        (id) => id && id !== buyer.id,
      );
      if (!ownerIds.length) {
        console.log('🛍️ [ShopOwner] Aucun propriétaire de boutique à notifier');
        return;
      }

      const owners = await this.userRepository.find({
        where: { id: In(ownerIds) },
        relations: ['settings'],
      });
      const ownerMap = new Map<string, UserEntity>(owners.map((o) => [o.id, o] as [string, UserEntity]));

      // Produits commandés par boutique (texte + image de la notification)
      const itemsByCompany = new Map<string, { names: string[]; image?: string; quantity: number }>();
      for (const item of finalOrder.orderItems ?? []) {
        const companyId = item.product?.company?.id;
        if (!companyId) continue;
        const entry = itemsByCompany.get(companyId) ?? { names: [], quantity: 0 };
        const label = item.variationLabel ? `${item.product.name} (${item.variationLabel})` : item.product?.name;
        if (label && !entry.names.includes(label)) entry.names.push(label);
        entry.quantity += Number(item.quantity ?? 0);
        if (!entry.image) {
          entry.image = item.product?.images?.[0]?.url ?? item.product?.image ?? undefined;
        }
        itemsByCompany.set(companyId, entry);
      }

      // ✅ Produits en attente de confirmation de disponibilité ?
      const needsAvailability = (finalOrder.orderItems ?? []).some(
        (i) => i.availabilityStatus === ItemAvailabilityStatus.PENDING,
      );

      for (const companyId of companyIds) {
        const group = groupedByCompany.get(companyId);
        const info = itemsByCompany.get(companyId) ?? { names: [], quantity: 0 };
        const products =
          info.names.slice(0, 3).join(', ') + (info.names.length > 3 ? ` +${info.names.length - 3}` : '');
        const totalAmount = Number(group?.total ?? 0).toFixed(2);

        for (const ownerId of ownersByCompany.get(companyId) ?? []) {
          if (!ownerId || ownerId === buyer.id) continue;
          const owner = ownerMap.get(ownerId);
          if (!owner) continue;

          const ownerLang = this.getUserLanguage(owner);
          const params = {
            invoiceNumber: finalOrder.invoiceNumber,
            products: products || '-',
            quantity: info.quantity,
            totalAmount,
            currency: finalOrder.currency,
            customer: buyer.fullName || '',
          };
          const title = this.i18nService.translate('order.push_shop_new_order_title', ownerLang, params);
          const body = this.i18nService.translate('order.push_shop_new_order_body', ownerLang, params);

          console.log(`🛍️ [ShopOwner] Notification à ${owner.fullName} (${owner.id}) — boutique ${companyId}`);

          // 1. ✅ Firebase sous forme d'APPEL (sonnerie) ; push classique si aucun appareil joint
          const rang = await this.orderCalls.ring(
            [owner.id],
            finalOrder.id,
            title,
            body,
            {
              action: 'NEW_ORDER_FOR_SHOP',
              companyId: String(companyId),
              invoiceNumber: String(finalOrder.invoiceNumber ?? ''),
              orderType: String(finalOrder.type ?? ''),
              // ✅ Le propriétaire doit confirmer la disponibilité (GET / PATCH /orders/availability/:orderId)
              confirmAvailability: needsAvailability ? 'true' : 'false',
            },
            info.image,
          );
          if (!rang.length) await this.pushNotificationHelper
            .sendAll({
              userId: owner.id,
              pushTitle: title,
              pushBody: body,
              pushData: {
                entity: 'ORDER',
                entityId: String(finalOrder.id),
                action: 'NEW_ORDER_FOR_SHOP',
                companyId: String(companyId),
                invoiceNumber: String(finalOrder.invoiceNumber ?? ''),
                confirmAvailability: needsAvailability ? 'true' : 'false',
              },
              imageUrl: info.image,
            })
            .catch((err: any) => console.error('[ShopOwner] push error:', err?.message));

          // 2. Temps réel (WebSocket) + historique des notifications
          await this.notificationsService
            .sendAndSaveNotification(owner.id, title, body, finalOrder.type as any, {
              orderId: finalOrder.id,
              invoiceNumber: finalOrder.invoiceNumber,
              companyId,
              totalAmount: Number(group?.total ?? 0),
              currency: finalOrder.currency,
              type: finalOrder.type,
              action: 'NEW_ORDER_FOR_SHOP',
              confirmAvailability: needsAvailability,
            })
            .catch((err: any) => console.error('[ShopOwner] save notification error:', err?.message));

          // Évite qu'il reçoive en plus la notification générique "admin"
          processedRecipients.add(owner.id);
        }
      }
    } catch (error: any) {
      console.error('❌ [ShopOwner] Erreur notification propriétaire:', error?.message);
    }
  }

  // ======================== MISE À JOUR DU STATUT ========================
  async updateOrderStatus(
    orderId: string,
    dto: UpdateOrderStatusDto,
    user: UserEntity,
    langHeader?: string,
  ): Promise<{ data: OrderEntity; message: string }> {
    // ✅ Commande prise en charge : la sonnerie (appel Firebase) s'arrête sur tous les appareils
    this.orderCalls.stop(orderId, 'HANDLED', user?.id);
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: [
        'orderItems.product.company',
        'orderItems.product.category',
        'orderItems.product.measure',
        'orderItems.variation', // ✅
        'orderItems.selectedAttributes', // ✅
        'subOrders',
        'subOrders.items.product.company',
        'subOrders.items.product.category',
        'subOrders.items.product.measure',
        'subOrders.company',
        'user',
        'addressUser',
        'deliveryAssignments',
        'deliveryAssignments.deliver',
        'deliveryAssignments.assignedBy',
      ],
    });
    if (!order) {
      const lang = langHeader || 'fr';
      throw new NotFoundException(
        this.i18nService.translate('order.order_not_found_by_id', lang, { orderId }),
      );
    }

    const lang = langHeader || this.getUserLanguage(order.user);

    // ============================================================
    // 🔒 VALIDATIONS DE TRANSITION
    // ============================================================
    if (dto.status === OrderStatus.REJECTED && order.status === OrderStatus.VALIDATED) {
      throw new BadRequestException(
        this.i18nService.translate('order.cannot_cancel_validated_order', lang),
      );
    }
    if (!isValidStatusTransition(order.status, dto.status)) {
      throw new BadRequestException(
        this.i18nService.translate('order.invalid_status_transition', lang, {
          current: order.status,
          next: dto.status,
        }),
      );
    }
    // ✅ AJOUT : impossible de valider une commande sans frais de livraison (> 0)
    if (
      dto.status === OrderStatus.VALIDATED &&
      (!order.shippingCost || Number(order.shippingCost) <= 0)
    ) {
      throw new BadRequestException(
        this.i18nService.translate('order.shipping_cost_required_for_validation', lang),
      );
    }

    // ============================================================
    // 🚚 LIVREUR : traiter une commande restaurant de sa branche = elle lui est affectée
    //    (refus si un autre livreur l'a déjà, ou si elle n'est pas dans sa branche)
    // ============================================================
    await this.branchDelivery.ensureAssignedOnProcess(orderId, user, lang);

    // ============================================================
    // ✅ MISE À JOUR DU STATUT UNIQUEMENT
    // ============================================================
    order.status = dto.status;
    const now = new Date();

    // ✅ PIN de livraison : créé et envoyé UNE SEULE FOIS, à la VALIDATION de la commande (notification + SMS).
    //    Jamais au paiement. Une commande qui a déjà un PIN ne le reçoit pas une deuxième fois.
    const sendPin = dto.status === OrderStatus.VALIDATED && !order.pin;
    if (sendPin) order.pin = GeneratePin.generate();

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

    // ============================================================
    // ✅ MISE À JOUR DES SOUS-COMMANDES (statut uniquement)
    // ============================================================
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

    // ============================================================
    // ✅ SAUVEGARDER
    // ============================================================
    const updatedOrder = await this.orderRepo.save(order);

    // ============================================================
    // ✅ NOTIFICATIONS (changement de statut uniquement)
    // ============================================================
    this.processOrderStatusUpdate(
      order,
      dto.status,
      sendPin, // ✅ validation → notification + SMS avec le PIN (la facture payée part au paiement)
      lang,
    ).catch((err) =>
      console.error('Erreur notifications statut commande:', err),
    );

    // ============================================================
    // ✅ ÉMETTRE À LA ROOM
    // ============================================================
    await this.notificationsGateway.sendOrderJoinedToRoom(orderId, {
      orderId,
      order: order,
    });

    return {
      message: this.i18nService.translate('order.order_status_updated_message', lang, {
        orderId,
      }),
      data: updatedOrder,
    };
  }

  async validateAndPayOrder(
    orderId: string,
    user: UserEntity,
    langHeader?: string,
  ): Promise<{ data: OrderEntity; message: string }> {
    // ✅ Commande prise en charge : la sonnerie (appel Firebase) s'arrête sur tous les appareils
    this.orderCalls.stop(orderId, 'PAID', user?.id);
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: [
        'orderItems.product.company',
        'orderItems.product.category',
        'orderItems.product.measure',
        'orderItems.variation', // ✅
        'orderItems.selectedAttributes', // ✅
        'subOrders',
        'subOrders.items.product.company',
        'subOrders.items.product.category',
        'subOrders.items.product.measure',
        'subOrders.company',
        'user',
        'addressUser',
        'deliveryAssignments',
        'deliveryAssignments.deliver',
        'deliveryAssignments.assignedBy',
      ],
    });
    if (!order) {
      const lang = langHeader || 'fr';
      throw new NotFoundException(
        this.i18nService.translate('order.order_not_found_by_id', lang, { orderId }),
      );
    }

    const lang = langHeader || this.getUserLanguage(order.user);

    // ============================================================
    // 🔒 VALIDATIONS (paiement uniquement)
    // ============================================================
    if (order.paymentStatus === PaymentStatus.PAID || order.paid) {
      throw new BadRequestException(
        this.i18nService.translate('order.order_already_paid', lang) ||
        'Cette commande est déjà payée.',
      );
    }
    if (order.status === OrderStatus.REJECTED) {
      throw new BadRequestException(
        this.i18nService.translate('order.cannot_pay_rejected_order', lang) ||
        'Impossible de payer une commande rejetée.',
      );
    }
    if (!order.shippingCost || Number(order.shippingCost) <= 0) {
      throw new BadRequestException(
        this.i18nService.translate('order.shipping_cost_required_for_validation', lang),
      );
    }

    // ============================================================
    // ✅ 1. MISE À JOUR DU PAIEMENT UNIQUEMENT (PAS DE STATUT)
    // ============================================================
    order.shippingCost = Number(Number(order.shippingCost).toFixed(3));
    order.grandTotal = Number(
      (
        Number(order.totalAmount) +
        Number(order.shippingCost) +
        Number(order.transactionFee || 0)
      ).toFixed(3),
    );
    order.paymentStatus = PaymentStatus.PAID;
    order.paid = true;
    // ✅ Le PIN n'est ni créé ni envoyé au paiement : il part une seule fois, à la validation.

    // ⚠️ On NE touche PAS à order.status
    // ⚠️ On NE touche PAS aux subOrders.status

    // ============================================================
    // ✅ 2. VÉRIFIER SI L'UTILISATEUR A UN PARRAIN
    // ============================================================
    const userWithReferrer = await this.userRepository.findOne({
      where: { id: order.userId },
      relations: ['referrer'],
    });

    const hasReferrer = !!(userWithReferrer?.referrer);

    const shippingCost = Number(Number(order.shippingCost || 0).toFixed(3));
    const transactionFee = Number(Number(order.transactionFee || 0).toFixed(3));
    const baseAmount = Number(Number(order.totalAmount).toFixed(3));
    const totalWithFees = Number((baseAmount + shippingCost + transactionFee).toFixed(3));

    // ============================================================
    // ✅ 3. ENVOYER LE PARRAINAGE (10%) - NON BLOQUANT
    // ============================================================
    if (hasReferrer && shippingCost > 0) {
      const parrainageAmount = Number((shippingCost * 0.10).toFixed(3));

      console.log(`[PayOrder] 👤 A un parrain: ${hasReferrer}`);
      console.log(`[PayOrder] 10% shipping pour parrainage: ${parrainageAmount}$`);

      if (parrainageAmount > 0) {
        const sendDto: FpaySendDto = {
          amount: Number(parrainageAmount.toFixed(3)),
          description: `Bonus parrainage (10%) - Achat de votre filleul, commande #${order.invoiceNumber}`,
          currency: order.currency || 'USD',
          countryCode: 'CD',
          paymentMethod: 'CASH',
        };

        this.fpayService
          .makeSendparrainage(sendDto, user)
          .then(async (result) => {
            if (result && result.success) {
              console.log(`[PayOrder] ✅ ${parrainageAmount} envoyé au compte Parrainage via FPay`);

              const referrerId = userWithReferrer?.referrer?.id;
              if (referrerId) {
                await this.updateReferralWithAmount(
                  referrerId,
                  order.userId,
                  Number(parrainageAmount.toFixed(3)),
                  order.invoiceNumber,
                  order.currency,
                );
              }
            } else if (result) {
              console.log(`[PayOrder] ⚠️ Parrainage non envoyé: ${result.message}`);
            }
          })
          .catch((error) => {
            console.error(`[PayOrder] ❌ Erreur envoi au parrainage:`, error.message);
          });

        console.log(`[PayOrder] 📤 Envoi parrainage en cours (non bloquant)...`);
      }
    } else {
      console.log(`[PayOrder] 👤 Sans parrain - Pas de parrainage envoyé`);
    }

    // ============================================================
    // ✅ 4. TRANSACTION
    // ============================================================
    try {
      const transaction = this.transactionRepository.create({
        orderId: order.id,
        amount: order.totalAmount,
        paymentStatus: PaymentStatus.PAID,
        transactionReference: uuidv4(),
        currency: order.currency || 'USD',
        type: TransactionType.CREDIT,
      });

      await this.transactionRepository.save(transaction);
      console.log(`[PayOrder] ✅ Transaction enregistrée`);
    } catch (txError: any) {
      console.error(`[PayOrder] ❌ Erreur enregistrement transaction:`, txError.message);
    }

    // ============================================================
    // ✅ 5. SAUVEGARDER
    // ============================================================
    const updatedOrder = await this.orderRepo.save(order);

    // ============================================================
    // ✅ 6. NOTIFICATIONS : paiement reçu + FACTURE PAYÉE par email, SANS PIN
    // ============================================================
    this.processOrderPaymentRecorded(order, lang).catch((err) => console.error('Erreur notifications paiement:', err));

    // ============================================================
    // ✅ 7. ÉMETTRE À LA ROOM
    // ============================================================
    await this.notificationsGateway.sendOrderJoinedToRoom(orderId, {
      orderId,
      order: order,
    });

    return {
      message:
        this.i18nService.translate('order.payment_success', lang) ||
        'Paiement effectué avec succès.',
      data: updatedOrder,
    };
  }

  /** ✅ Commande validée (ou plus loin) : c'est à ce stade que le client a reçu son PIN */
  private isValidatedStage(status?: OrderStatus | null): boolean {
    return status === OrderStatus.VALIDATED || status === OrderStatus.PROCESSING || status === OrderStatus.COMPLETED;
  }

  // ======================== NOTIFICATIONS PAIEMENT ENREGISTRÉ (SANS PIN) ========================
  /**
   * ✅ Paiement confirmé par l'administrateur : notification « paiement reçu » + facture payée par email.
   * Le PIN n'est PAS envoyé ici : il part à la validation de la commande (notification + SMS).
   */
  private async processOrderPaymentRecorded(order: OrderEntity, lang: string = 'fr'): Promise<void> {
    try {
      let imageUrl: string | undefined;
      if (order.orderItems?.length) {
        const firstItem = order.orderItems[0];
        if (firstItem.product?.images?.length) imageUrl = firstItem.product.images[0].url;
        else if (firstItem.product?.image) imageUrl = firstItem.product.image;
      }
      const title = this.i18nService.translate('order.push_order_payment_received_title', lang);
      const body = this.i18nService.translate('order.push_order_payment_received_body', lang, { invoiceNumber: order.invoiceNumber });

      // 📥 Notification in-app
      await this.notificationsService.sendAndSaveNotification(order.userId, title, body, NotificationType.ORDER_UPDATED, {
        orderId: order.id,
        status: order.status,
        paymentStatus: PaymentStatus.PAID,
      });

      const hasEmail = order.user?.email && order.user.email.trim() !== '';
      const notificationOptions: any = {
        userId: order.userId,
        pushTitle: title,
        pushBody: body,
        pushData: { entity: 'ORDER', entityId: order.id },
        imageUrl,
        // ❌ Pas de SMS : le SMS avec le PIN part à la validation
      };
      if (hasEmail) {
        notificationOptions.emailTo = order.user.email;
        notificationOptions.emailSubject = this.i18nService.translate('order.paid_invoice_subject', lang);
        const keys = [
          'invoice', 'billed_to', 'customer_info', 'client', 'pin', 'date', 'reference', 'number', 'products',
          'unit_price', 'qty', 'total', 'no_items', 'payment_info', 'account', 'name', 'mobile_money', 'summary',
          'subtotal', 'delivery', 'total_amount', 'thank_you', 'thanks_team', 'contact', 'status_paid', 'status_pending',
          'status_rejected', 'unit', 'hour', 'payment_method', 'cash', 'total_ht', 'shipping_cost', 'vat', 'total_ttc',
          'notes_conditions', 'notes_line_1', 'notes_line_2', 'thank_you_footer', 'legal_line_1', 'legal_line_2', 'legal_line_3',
        ];
        const translations: Record<string, string> = {
          email_label: this.i18nService.translate('order.email.email', lang),
          phone_label: this.i18nService.translate('order.email.phone', lang),
          address_label: this.i18nService.translate('order.email.address', lang),
        };
        for (const k of keys) translations[k] = this.i18nService.translate(`order.email.${k}`, lang);
        notificationOptions.emailContext = {
          paymentQrCode: null,
          invoiceNumber: order.invoiceNumber,
          user: order.user,
          subOrders: order.subOrders || [],
          order,
          year: new Date().getFullYear(),
          translations,
          lang,
        };
        notificationOptions.sendInvoicePaidWithPdf = true;
      }
      await this.pushNotificationHelper.sendAll(notificationOptions);
    } catch (error) {
      console.error('Erreur dans processOrderPaymentRecorded:', error);
    }
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

      // ============================================================
      // 📥 Notification in-app (toujours envoyée)
      // ============================================================
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

      // ============================================================
      // 🅰️ BRANCHE 1 : Commande nouvellement validée / payée
      //     → SMS + Email facture PAID
      //     ⚠️ Le SMS n'est envoyé QUE dans cette branche (VALIDATED)
      // ============================================================
      if (isNewlyValidated) {
        const hasPhone = order.user.phone && order.user.phone.trim() !== '';

        const notificationOptions: any = {
          userId: order.userId,
          pushTitle: this.i18nService.translate('order.push_order_validated_title', lang),
          pushBody: this.i18nService.translate('order.push_order_validated_body', lang, {
            invoiceNumber: order.invoiceNumber,
            pin: order.pin,
          }),
          pushData: { entity: 'ORDER', entityId: order.id },
          imageUrl,
        };

        // ============================================================
        // 📱 SMS — envoyé UNIQUEMENT pour VALIDATED
        // ============================================================
        if (hasPhone) {
          notificationOptions.phoneNumber = order.user.phone;
          notificationOptions.smsBody = this.i18nService.translate('order.sms_order_validated', lang, {
            invoiceNumber: order.invoiceNumber,
            pin: order.pin,
            shippingCost: Number(order.shippingCost ?? 0).toFixed(2),
            currency: order.currency || 'USD',
          });
          notificationOptions.smsCategory = SmsCategory.ORDER;
          notificationOptions.smsReferenceId = order.id;
          notificationOptions.smsReferenceType = 'ORDER_STATUS_VALIDATED';
        }

        // 📧 Pas de facture à la validation : la facture PAYÉE part quand la commande est marquée payée

        // ✅ UN SEUL envoi : notification + SMS avec le PIN
        await this.pushNotificationHelper.sendAll(notificationOptions);
      }

      // ============================================================
      // 🅱️ BRANCHE 2 : Simple changement de statut
      //     ⚠️ AUCUN SMS ici (pas de smsBody, pas de smsCategory)
      // ============================================================
      else {
        let pushTitleKey = '', pushBodyKey = '';
        switch (newStatus) {
          case OrderStatus.PENDING:
            pushTitleKey = 'order.push_order_pending_title';
            pushBodyKey = 'order.push_order_pending_body';
            break;
          case OrderStatus.PROCESSING:
            pushTitleKey = 'push_order_processing_title';
            pushBodyKey = 'push_order_processing_body';
            break;
          case OrderStatus.COMPLETED:
            pushTitleKey = 'push_order_completed_title';
            pushBodyKey = 'push_order_completed_body';
            break;
          case OrderStatus.DELIVERED:
            pushTitleKey = 'push_order_delivered_title';
            pushBodyKey = 'push_order_delivered_body';
            break;
          case OrderStatus.REJECTED:
            pushTitleKey = 'push_order_rejected_title';
            pushBodyKey = 'push_order_rejected_body';
            break;
          default:
            pushTitleKey = 'order.push_order_updated_title';
            pushBodyKey = 'order.push_order_updated_body';
        }

        const pushTitle = this.i18nService.translate(pushTitleKey, lang, { invoiceNumber: order.invoiceNumber });
        const pushBody = this.i18nService.translate(pushBodyKey, lang, { invoiceNumber: order.invoiceNumber });

        // ✅ Push uniquement — AUCUN SMS dans cette branche
        await this.pushNotificationHelper.sendAll({
          userId: order.userId,
          pushTitle,
          pushBody,
          pushData: { entity: 'ORDER', entityId: order.id },
          imageUrl,
          // ❌ Pas de phoneNumber
          // ❌ Pas de smsBody
          // ❌ Pas de smsCategory
          // ❌ Pas de smsReferenceId
          // ❌ Pas de smsReferenceType
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
        'orderItems.variation', // ✅
        'orderItems.selectedAttributes', // ✅
        'subOrders',
        'subOrders.items.product.company',
        'subOrders.items.product.category',
        'subOrders.items.product.measure',
        'subOrders.company',
        'user',
        'addressUser',
        'deliveryAssignments',              // 🔥 AJOUT
        'deliveryAssignments.deliver',      // 🔥 AJOUT
        'deliveryAssignments.assignedBy',   // 🔥 AJOUT
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

      // AJOUT
      unit: this.i18nService.translate('order.email.unit', lang),
      hour: this.i18nService.translate('order.email.hour', lang),

      unit_price: this.i18nService.translate('order.email.unit_price', lang),
      qty: this.i18nService.translate('order.email.qty', lang),
      total: this.i18nService.translate('order.email.total', lang),
      no_items: this.i18nService.translate('order.email.no_items', lang),

      payment_info: this.i18nService.translate('order.email.payment_info', lang),

      // AJOUT
      payment_method: this.i18nService.translate(
        'order.email.payment_method',
        lang,
      ),
      account: this.i18nService.translate('order.email.account', lang),
      name: this.i18nService.translate('order.email.name', lang),
      mobile_money: this.i18nService.translate('order.email.mobile_money', lang),
      cash: this.i18nService.translate('order.email.cash', lang),
      card: this.i18nService.translate('order.email.card', lang),
      bank_transfer: this.i18nService.translate(
        'order.email.bank_transfer',
        lang,
      ),

      summary: this.i18nService.translate('order.email.summary', lang),
      subtotal: this.i18nService.translate('order.email.subtotal', lang),
      delivery: this.i18nService.translate('order.email.delivery', lang),
      total_amount: this.i18nService.translate('order.email.total_amount', lang),

      // AJOUT
      total_ht: this.i18nService.translate('order.email.total_ht', lang),
      shipping_cost: this.i18nService.translate(
        'order.email.shipping_cost',
        lang,
      ),
      vat: this.i18nService.translate('order.email.vat', lang),
      total_ttc: this.i18nService.translate('order.email.total_ttc', lang),

      thank_you: this.i18nService.translate('order.email.thank_you', lang),
      thanks_team: this.i18nService.translate('order.email.thanks_team', lang),
      contact: this.i18nService.translate('order.email.contact', lang),

      // AJOUT
      notes_conditions: this.i18nService.translate(
        'order.email.notes_conditions',
        lang,
      ),
      notes_line_1: this.i18nService.translate(
        'order.email.notes_line_1',
        lang,
      ),
      notes_line_2: this.i18nService.translate(
        'order.email.notes_line_2',
        lang,
      ),

      // AJOUT
      thank_you_footer: this.i18nService.translate(
        'order.email.thank_you_footer',
        lang,
      ),
      legal_line_1: this.i18nService.translate(
        'order.email.legal_line_1',
        lang,
      ),
      legal_line_2: this.i18nService.translate(
        'order.email.legal_line_2',
        lang,
      ),
      legal_line_3: this.i18nService.translate(
        'order.email.legal_line_3',
        lang,
      ),
      customer_service: this.i18nService.translate(
        'order.email.customer_service',
        lang,
      ),

      status_paid: this.i18nService.translate('order.email.status_paid', lang),
      status_pending: this.i18nService.translate(
        'order.email.status_pending',
        lang,
      ),
      status_rejected: this.i18nService.translate(
        'order.email.status_rejected',
        lang,
      ),
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
    // ✅ Commande prise en charge : la sonnerie (appel Firebase) s'arrête sur tous les appareils
    this.orderCalls.stop(orderId, 'HANDLED', user?.id);
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: [
        'orderItems.product.company',
        'orderItems.product.category',
        'orderItems.product.measure',
        'orderItems.product.images',
        'subOrders',
        'subOrders.items.product.company',
        'subOrders.items.product.category',
        'subOrders.items.product.measure',
        'subOrders.company',
        'user',
        'addressUser',
        'deliveryAssignments',
        'deliveryAssignments.deliver',
        'deliveryAssignments.assignedBy',
      ],
    });

    if (!order) {
      throw new NotFoundException(
        this.i18nService.translate('order.not_found', lang)
      );
    }

    if (shippingCost < 0) {
      throw new BadRequestException(
        this.i18nService.translate('order.shipping_cost_positive', lang)
      );
    }

    if (
      order.status === OrderStatus.DELIVERED ||
      order.status === OrderStatus.VALIDATED ||
      order.status === OrderStatus.REJECTED
    ) {
      throw new BadRequestException(
        this.i18nService.translate('order.cannot_modify_finalized', lang)
      );
    }

    const oldShippingCost = order.shippingCost || 0;

    order.shippingCost = shippingCost;
    order.readyToPay = true;
    if (user) {
      order.validatedBy = user;
    }

    const itemsTotal = order.orderItems?.reduce(
      (sum, item) => sum + (item.price * item.quantity),
      0
    ) || 0;

    order.grandTotal = itemsTotal + shippingCost + (order.transactionFee || 0);

    const updatedOrder = await this.orderRepo.save(order);

    const finalOrder = await this.orderRepo.findOne({
      where: { id: order.id },
      relations: [
        'orderItems.product.company',
        'orderItems.product.category',
        'orderItems.product.measure',
        'orderItems.product.images',
        'subOrders',
        'subOrders.items.product.company',
        'subOrders.items.product.category',
        'subOrders.items.product.measure',
        'subOrders.company',
        'user',
        'addressUser',
        'deliveryAssignments',
        'deliveryAssignments.deliver',
        'deliveryAssignments.assignedBy',
      ],
    });

    if (!finalOrder) {
      throw new NotFoundException(
        this.i18nService.translate('order.order_not_found_after_update', lang)
      );
    }

    this.processShippingCostUpdate(
      finalOrder,
      oldShippingCost,
      shippingCost,
      lang,
    ).catch((err) =>
      console.error('[Order] Erreur notifications frais de livraison:', err),
    );

    return {
      message: this.i18nService.translate('order.shipping_cost_updated', lang, {
        oldCost: oldShippingCost,
        newCost: shippingCost,
      }),
      data: finalOrder,
    };
  }

  private async processShippingCostUpdate(
    order: OrderEntity,
    oldShippingCost: number,
    newShippingCost: number,
    lang: string = 'fr',
  ): Promise<void> {
    try {
      console.log(`[Order] 📤 Envoi notifications frais de livraison pour #${order.invoiceNumber}`);
      console.log(`[Order] Ancien: ${oldShippingCost} → Nouveau: ${newShippingCost}`);

      // ✅ Récupérer l'image du premier produit
      let imageUrl: string | undefined;
      if (order.orderItems?.length) {
        const firstItem = order.orderItems[0];
        if (firstItem.product?.images?.length) {
          imageUrl = firstItem.product.images[0].url;
        } else if (firstItem.product?.image) {
          imageUrl = firstItem.product.image;
        }
      }

      // ✅ 1. Notification in-app
      const inAppTitle = this.i18nService.translate('order.shipping_cost_updated_title', lang, {
        invoiceNumber: order.invoiceNumber,
      });
      const inAppContent = this.i18nService.translate('order.shipping_cost_updated_content', lang, {
        invoiceNumber: order.invoiceNumber,
        oldCost: oldShippingCost,
        newCost: newShippingCost,
        currency: order.currency,
      });

      await this.notificationsService.sendAndSaveNotification(
        order.userId,
        inAppTitle,
        inAppContent,
        NotificationType.ORDER_UPDATED,
        {
          orderId: order.id,
          status: order.status,
          oldShippingCost: oldShippingCost,
          newShippingCost: newShippingCost,
        },
      );

      console.log(`[Order] ✅ Notification in-app envoyée`);

      // ✅ 2. Push notification + SMS
      const hasPhone = order.user?.phone && order.user.phone.trim() !== '';

      const pushTitle = this.i18nService.translate('order.push_shipping_cost_updated_title', lang, {
        invoiceNumber: order.invoiceNumber,
      });

      const pushBody = this.i18nService.translate('order.push_shipping_cost_updated_body', lang, {
        invoiceNumber: order.invoiceNumber,
        oldCost: oldShippingCost,
        newCost: newShippingCost,
        currency: order.currency,
      });

      let smsAllowed = false;
      if (hasPhone) {
        smsAllowed = await this.consumeSmsQuota(order.id, 'ORDER_SHIPPING_COST_UPDATED', order.user?.phone);
      }

      if (hasPhone && !smsAllowed) {
        console.warn(`[Order] SMS ORDER_SHIPPING_COST_UPDATED bloqué (quota épuisé) pour ${order.user.phone}`);
      }

      const smsBody = (hasPhone && smsAllowed)
        ? this.i18nService.translate('order.sms_shipping_cost_updated', lang, {
          invoiceNumber: order.invoiceNumber,
          oldCost: oldShippingCost,
          newCost: newShippingCost,
          currency: order.currency,
        })
        : undefined;

      await this.pushNotificationHelper.sendAll({
        userId: order.userId,
        pushTitle,
        pushBody,
        pushData: {
          entity: 'ORDER',
          entityId: order.id,
          action: 'SHIPPING_COST_UPDATED',
        },
        phoneNumber: (hasPhone && smsAllowed) ? order.user.phone : undefined,
        smsBody: smsBody,
        imageUrl,
      });

      console.log(`[Order] ✅ Push + SMS envoyés`);

    } catch (error: any) {
      console.error('[Order] ❌ Erreur dans processShippingCostUpdate:', error.message);
    }
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

  async getOrdersByUser(
    userId: string,
    pageNumber?: number,
    limitNumber?: number,
  ) {
    // ============================================================
    // ✅ Valeurs par défaut de pagination
    // ============================================================
    const page = pageNumber && pageNumber > 0 ? pageNumber : 1;
    const limit =
      limitNumber && limitNumber > 0 ? Math.min(limitNumber, 100) : 20;

    // ============================================================
    // 🔍 Requête : leftJoin (SANS AndSelect) pour les users joints
    //    → puis addSelect pour choisir les colonnes
    // ============================================================
    const query = this.orderRepo
      .createQueryBuilder('order')
      // Champs order : tout
      .select('order')
      // Relations principales (avec AndSelect, toutes les colonnes OK)
      .leftJoinAndSelect('order.user', 'user')
      .leftJoinAndSelect('order.addressUser', 'addressUser')
      .leftJoinAndSelect('addressUser.country', 'addressCountry')
      .leftJoinAndSelect('addressUser.city', 'addressCity')
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
      .leftJoinAndSelect('order.deliveryAssignments', 'assignment')
      .leftJoinAndSelect('assignment.deliver', 'deliver')
      .leftJoinAndSelect('assignment.assignedBy', 'assignedBy')
      .leftJoinAndSelect('order.currentDeliveryUser', 'currentDeliveryUser')
      // ✅ Pour ces users, on limite les colonnes
      //    → on retire leur auto-select en utilisant leftJoin SANS AndSelect
      //    MAIS on les garde en AndSelect pour simplifier (voir note ci-dessous)
      .leftJoinAndSelect('order.validatedBy', 'validatedBy')
      .leftJoinAndSelect('order.processingBy', 'processingBy')
      .leftJoinAndSelect('order.completedBy', 'completedBy')
      .leftJoinAndSelect('order.deliveredBy', 'deliveredBy')
      .leftJoinAndSelect('order.rejectedBy', 'rejectedBy')
      .leftJoinAndSelect('order.delivery', 'delivery')
      .where('order.userId = :userId', { userId })
      .orderBy('order.createdAt', 'DESC');

    // ============================================================
    // 🔥 Pagination (avec valeurs par défaut)
    // ============================================================
    query.skip((page - 1) * limit).take(limit);

    const orders = await query.getMany();

    // ============================================================
    // 🔥 RETOUR (formatage identique)
    // ============================================================
    return {
      message: 'Commandes récupérées avec succès',
      data: orders.map((o) => {
        const activeAssignment = o.deliveryAssignments?.find(
          (a) => a.isActive,
        );

        const sanitizeUser = (u: any) => {
          if (!u) return null;
          return {
            id: u.id,
            fullName: u.fullName,
            phone: u.phone ?? null,
            image: u.image ?? null,
          };
        };

        return {
          id: o.id,
          invoiceNumber: o.invoiceNumber,
          status: o.status,
          paymentStatus: o.paymentStatus,
          paid: o.paid,
          pin: o.pin,
          readyToPay: o.readyToPay,

          totalAmount: o.totalAmount,
          grandTotal: o.grandTotal,
          shippingCost: o.shippingCost,
          currency: o.currency,

          paymentMethod: o.paymentMethod,
          appliedFeeRate: o.appliedFeeRate,
          transactionFee: o.transactionFee,

          type: o.type,
          shopType: o.shopType,
          whatsapp_number: o.whatsapp_number,

          createdAt: o.createdAt,
          updatedAt: o.updatedAt,
          validatedAt: o.validatedAt,
          processingAt: o.processingAt,
          completedAt: o.completedAt,
          deliveredAt: o.deliveredAt,
          rejectedAt: o.rejectedAt,
          cancelledAt: o.cancelledAt,
          cancellationReason: o.cancellationReason,

          user: o.user
            ? {
              id: o.user.id,
              fullName: o.user.fullName,
              phone: o.user.phone ?? null,
              email: o.user.email ?? null,
              image: o.user.image ?? null,
            }
            : null,

          addressUser: o.addressUser
            ? {
              id: o.addressUser.id,
              address: o.addressUser.address,
              firstName: o.addressUser.firstName ?? null,
              lastName: o.addressUser.lastName ?? null,
              phone: o.addressUser.phone ?? null,
              latitude: o.addressUser.latitude ?? null,
              longitude: o.addressUser.longitude ?? null,
              city: o.addressUser.city ?? null,
              country: o.addressUser.country ?? null,
            }
            : null,

          orderItems: o.orderItems,
          subOrders: o.subOrders,

          currentDeliveryUser: sanitizeUser(o.currentDeliveryUser),

          validatedBy: sanitizeUser(o.validatedBy),
          processingBy: sanitizeUser(o.processingBy),
          completedBy: sanitizeUser(o.completedBy),
          deliveredBy: sanitizeUser(o.deliveredBy),
          rejectedBy: sanitizeUser(o.rejectedBy),

          deliver: sanitizeUser(activeAssignment?.deliver),

          assignedBy: activeAssignment?.assignedBy
            ? {
              id: activeAssignment.assignedBy.id,
              fullName: activeAssignment.assignedBy.fullName,
              role: activeAssignment.assignedBy.role,
            }
            : null,

          assignment: activeAssignment
            ? {
              assignmentId: activeAssignment.id,
              status: activeAssignment.status,
              assignedAt: activeAssignment.assignedAt,
              pickedUpAt: activeAssignment.pickedUpAt,
              deliveredAt: activeAssignment.deliveredAt,
              isActive: activeAssignment.isActive,
            }
            : null,

          tracking: {
            currentLatitude: activeAssignment?.currentLatitude ?? null,
            currentLongitude: activeAssignment?.currentLongitude ?? null,
            distanceRemainingKm:
              activeAssignment?.distanceRemainingKm ?? null,
            estimatedArrivalMinutes:
              activeAssignment?.estimatedArrivalMinutes ?? null,
            lastLocationUpdate:
              activeAssignment?.lastLocationUpdate ?? null,
          },
        };
      }),
    };
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

    const userWithRelations = await this.userRepository.findOne({
      where: { id: user.id },
      relations: ['activeBranch', 'activeBranch.city']
    });

    if (!userWithRelations) {
      throw new NotFoundException(this.i18nService.translate('user.not_found', lang));
    }

    const fullUser = userWithRelations;

    const company = await this.companyRepo.findOne({
      where: { id: fullUser.activeCompanyId },
    });

    if (!company) {
      throw new NotFoundException(this.i18nService.translate('order.company_not_found', lang));
    }

    const isSuperAdmin = fullUser.role === 'SUPER ADMIN';
    const orderType = type || company.typeCompany;

    const isCityFilterable = orderType === 'RESTAURANT' || orderType === 'GROCERY';

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

    console.log('🔍 DEBUG findByType:');
    console.log('user.id:', fullUser.id);
    console.log('user.activeBranchId:', fullUser.activeBranchId);
    console.log('userCityId:', userCityId);
    console.log('userCityName:', userCityName);
    console.log('hasCityFilter:', hasCityFilter);
    console.log('isSuperAdmin:', isSuperAdmin);
    console.log('isCityFilterable:', isCityFilterable);
    console.log('orderType:', orderType);

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
      .leftJoinAndSelect('order.deliveryAssignments', 'deliveryAssignments')
      .leftJoinAndSelect('deliveryAssignments.deliver', 'deliveryAssignmentsDeliver')
      .leftJoinAndSelect('deliveryAssignments.assignedBy', 'deliveryAssignmentsAssignedBy')
      .orderBy('order.createdAt', 'DESC');

    if (type) {
      query.where('order.type = :type', { type });
    } else {
      query.where('order.type = :type', { type: company.typeCompany });
    }

    if (isSuperAdmin) {
      console.log('✅ SUPER ADMIN - Pas de filtre');
    } else if (hasManagePermission) {
      console.log('✅ canManage - Pas de filtre');
    } else if (!fullUser.activeBranchId) {
      throw new BadRequestException(
        this.i18nService.translate('order.no_active_branch', lang)
      );
    } else if (hasCityFilter) {
      query.andWhere('subOrderCompany.cityId = :userCityId', { userCityId });
      console.log('✅ Filtre appliqué: subOrderCompany.cityId =', userCityId);
    } else {
      console.log('⚠️ Type non filtrable - pas de filtre supplémentaire');
    }

    const skip = (page - 1) * limit;
    query.skip(skip).take(limit);

    const sql = query.getSql();
    console.log('📝 SQL:', sql);

    const [orders, total] = await query.getManyAndCount();
    console.log('📊 Nombre de commandes trouvées:', total);

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
        'orderItems.variation', // ✅
        'orderItems.selectedAttributes', // ✅
        'subOrders',
        'subOrders.items.product.company',
        'subOrders.items.product.category',
        'subOrders.items.product.measure',
        'subOrders.company',
        'user',
        'addressUser',
        'deliveryAssignments',
        'deliveryAssignments.deliver',
        'deliveryAssignments.assignedBy',
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
        'orderItems.variation', // ✅
        'orderItems.selectedAttributes', // ✅
        'subOrders',
        'subOrders.items.product.company',
        'subOrders.items.product.category',
        'subOrders.items.product.measure',
        'subOrders.company',
        'user',
        'addressUser',
        'deliveryAssignments',
        'deliveryAssignments.deliver',
        'deliveryAssignments.assignedBy',
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
        'deliveryAssignments',
        'deliveryAssignments.deliver',
        'deliveryAssignments.assignedBy',
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
      totalRevenue: Record<string, number>;
      totalShippingFees: Record<string, number>;
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

    const orders = await this.orderRepo
      .createQueryBuilder('order')
      .where(whereClause, whereParams)
      .getMany();

    const totalOrders = orders.length;
    const deliveredOrders = orders.filter((o) => o.status === OrderStatus.DELIVERED);
    const totalSales = deliveredOrders.length;

    // ============================================================
    // ✅ GROUPEMENT PAR DEVISE
    // ============================================================
    const totalRevenue = orders.reduce((acc, o) => {
      const currency = o.currency || 'USD';
      if (!acc[currency]) acc[currency] = 0;
      acc[currency] += Number(o.totalAmount || 0);
      return acc;
    }, {} as Record<string, number>);

    const totalShippingFees = orders.reduce((acc, o) => {
      const currency = o.currency || 'USD';
      if (!acc[currency]) acc[currency] = 0;
      acc[currency] += Number(o.shippingCost || 0);
      return acc;
    }, {} as Record<string, number>);

    // ============================================================
    // 📊 ordersByDay
    // ============================================================
    const ordersByDay = await this.orderRepo
      .createQueryBuilder('order')
      .select('DATE(order.createdAt)', 'date')
      .addSelect('COUNT(order.id)', 'count')
      .addSelect('SUM(order.totalAmount)', 'amount')
      .where(whereClause, whereParams)
      .groupBy('DATE(order.createdAt)')
      .orderBy('DATE(order.createdAt)', 'ASC')
      .getRawMany();

    // ============================================================
    // ✅ revenueByDay groupé par devise
    // ============================================================
    const revenueByDayRaw = await this.orderRepo
      .createQueryBuilder('order')
      .select('DATE(order.createdAt)', 'date')
      .addSelect('order.currency', 'currency')
      .addSelect('SUM(order.totalAmount)', 'revenue')
      .addSelect('SUM(order.shippingCost)', 'shipping')
      .where(whereClause, whereParams)
      .groupBy('DATE(order.createdAt)')
      .addGroupBy('order.currency')
      .orderBy('DATE(order.createdAt)', 'ASC')
      .getRawMany();

    const revenueByDayMap: Record<
      string,
      { date: string; revenue: Record<string, number>; shipping: Record<string, number> }
    > = {};

    for (const row of revenueByDayRaw) {
      const date = row.date;
      const currency = row.currency || 'USD';

      if (!revenueByDayMap[date]) {
        revenueByDayMap[date] = {
          date,
          revenue: {},
          shipping: {},
        };
      }

      revenueByDayMap[date].revenue[currency] = Number(
        Number(row.revenue || 0).toFixed(2),
      );
      revenueByDayMap[date].shipping[currency] = Number(
        Number(row.shipping || 0).toFixed(2),
      );
    }

    const revenueByDay = Object.values(revenueByDayMap);

    // ============================================================
    // 📊 topProducts
    // ============================================================
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

    if (type && type !== 'ALL') {
      topProductsQueryBuilder.andWhere('order.type = :type', { type });
    }

    const topProducts = await topProductsQueryBuilder
      .groupBy('product.id, product.name')
      .orderBy('count', 'DESC')
      .limit(10)
      .getRawMany();

    // ============================================================
    // 📊 Compteurs
    // ============================================================
    const totalProductsQueryBuilder = this.productRepo
      .createQueryBuilder('product')
      .select('COUNT(product.id)', 'count');

    if (type && type !== 'ALL') {
      totalProductsQueryBuilder
        .innerJoin('product.company', 'company')
        .where('company.typeCompany = :type', { type });
    }

    totalProductsQueryBuilder.andWhere('product.createdAt BETWEEN :start AND :end', {
      start: dateDebut,
      end: adjustedDateFin,
    });

    const totalProductsResult = await totalProductsQueryBuilder.getRawOne();
    const totalProducts = parseInt(totalProductsResult?.count || 0);

    const totalUsers = await this.userRepository.count({
      where: { createdAt: Between(dateDebut, adjustedDateFin) },
    });

    const totalCompaniesWhere: any = {
      createdAt: Between(dateDebut, adjustedDateFin),
    };
    if (type && type !== 'ALL') totalCompaniesWhere.typeCompany = type;
    const totalCompanies = await this.companyRepo.count({ where: totalCompaniesWhere });

    // ============================================================
    // ✅ RETURN
    // ============================================================
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
    // ✅ Commande prise en charge : la sonnerie (appel Firebase) s'arrête sur tous les appareils
    this.orderCalls.stop(orderId, 'CANCELLED', user?.id);
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: [
        'user',
        'orderItems',
        'orderItems.product',
        'subOrders',
        'subOrders.items',
        'subOrders.items.product',
        'deliveryAssignments',
        'deliveryAssignments.deliver',
        'deliveryAssignments.assignedBy',
      ],
    });

    if (!order) {
      const lang = langHeader || 'fr';
      throw new NotFoundException(this.i18nService.translate('order.order_not_found_by_id', lang, { orderId }));
    }

    const lang = langHeader || this.getUserLanguage(order.user);

    if (order.user.id !== user.id) {
      throw new ForbiddenException(this.i18nService.translate('order.cannot_cancel_others_order', lang));
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException(
        this.i18nService.translate('order.cannot_cancel_order_only_pending', lang, {
          status: order.status,
        }),
      );
    }

    order.cancellationReason = cancelDto.reason || undefined;
    order.cancelledAt = new Date();
    order.status = OrderStatus.REJECTED;
    order.rejectedBy = user;
    order.rejectedAt = new Date();

    if (order.subOrders?.length) {
      for (const subOrder of order.subOrders) {
        subOrder.status = OrderStatus.REJECTED;
        await this.subOrderRepo.save(subOrder);
      }
    }

    const updatedOrder = await this.orderRepo.save(order);

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
      let smsAllowed = false;
      if (hasPhone) {
        smsAllowed = await this.consumeSmsQuota(order.id, 'ORDER_CANCELLED', order.user?.phone);
      }

      if (hasPhone && !smsAllowed) {
        console.warn(`[Order] SMS ORDER_CANCELLED bloqué (quota épuisé) pour ${order.user.phone}`);
      }

      await this.pushNotificationHelper.sendAll({
        userId: order.user.id,
        pushTitle: this.i18nService.translate('order.push_order_cancelled_title', lang),
        pushBody: this.i18nService.translate('order.push_order_cancelled_body', lang, {
          invoiceNumber: order.invoiceNumber,
          reason: reason || this.i18nService.translate('order.no_reason_provided', lang),
        }),
        pushData: { entity: 'ORDER', entityId: order.id },
        phoneNumber: (hasPhone && smsAllowed) ? order.user.phone : undefined,
        smsBody: (hasPhone && smsAllowed)
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

      // ✅ Personnes CONCERNÉES par l'annulation (plus « tous les utilisateurs de la plateforme ») :
      //    responsables des boutiques de la commande + administrateurs de sa ville (+ super admins)
      const subOrders = await this.subOrderRepo.find({ where: { order: { id: order.id } } as any, relations: ['company'] });
      const companyIds = [...new Set(subOrders.map((so) => so.company?.id).filter(Boolean))] as string[];
      const shopStaff = companyIds.length
        ? await this.userHasCompanyRepo
          .createQueryBuilder('uhc')
          .select('DISTINCT uhc.userId', 'userId')
          .where('uhc.companyId IN (:...companyIds)', { companyIds })
          .andWhere('uhc.isOwner = 1')
          .getRawMany()
        : [];
      const { cityIds } = await this.orderCities(subOrders);
      const staff = await this.orderStaffRecipients(
        this.permissionHelper.getOrderResourceByCompanyType(order.type),
        cityIds,
        order.userId,
      );
      // Propriétaires de boutique : toutes leurs applications (ils gèrent souvent depuis le mobile) ;
      // administrateurs : seulement les back-offices
      const ownerIds = new Set<string>(shopStaff.map((r) => r.userId).filter(Boolean));
      const recipients = new Map<string, string[] | undefined>();
      for (const id of ownerIds) recipients.set(id, undefined);
      for (const u of staff) if (!recipients.has(u.id)) recipients.set(u.id, ORDER_STAFF_CHANNELS);
      recipients.delete(order.userId); // le client est déjà prévenu plus haut

      const cancelTitle = this.i18nService.translate('order.order_cancelled_title', lang);
      const cancelBody = this.i18nService.translate('order.order_cancelled_detail', lang, {
        invoiceNumber: order.invoiceNumber,
        reason: reason || this.i18nService.translate('order.no_reason_provided', lang),
        clientName: order.user?.fullName || order.user?.email,
      });
      for (const [recipientId, channels] of recipients) {
        await this.notificationsService.sendAndSaveNotification(
          recipientId,
          cancelTitle,
          cancelBody,
          order.type as any,
          { orderId: order.id, invoiceNumber: order.invoiceNumber, status: 'CANCELLED', type: order.type },
          channels ? { channels } : undefined,
        );
      }

      console.log(`[processOrderCancellation] Commande ${order.invoiceNumber} annulée avec succès`);
    } catch (error) {
      console.error('Erreur dans processOrderCancellation:', error);
    }
  }
}