/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { UpdateShipmentDto } from './dto/update-shipment.dto';
import { TypeTransport } from './entity/type-transport.entity';
import { PackageDetails } from './entity/package-details.entity';
import { Shipment } from './entity/shipment.entity';
import { ShipmentStatus } from './enum/shipment.dto';
import { TrackingNumberUtil } from 'src/users/utility/helpers/tracking-number.util';
import { UserEntity } from 'src/users/entities/user.entity';
import { ShipmentPriceDto } from './dto/createShipmentPrice.dto';
import { SmsHelper } from 'src/users/utility/helpers/sms.helper';
import { MailOrderService } from 'src/email/emailorder.service';
import { CreateShipmentAdminDto } from './dto/create-shipment.admin.dto';
import { UpdateShipmentAdminDto } from './dto/update-shipment.admin.dto';
import { CloudinaryService } from 'src/users/utility/helpers/cloudinary.service';
import { GeneratePin } from 'src/users/utility/helpers/GeneratePin.util';
import { MailService } from 'src/email/email.service';
import { CollectShipmentResponseDto } from './dto/collect-shipment-response.dto';
import { CollectShipmentBodyDto } from './dto/collect-shipment-body.dto';
import { OperationEntity } from 'src/operation/entity/operation.entity';
import { OperationStatus } from 'src/operation/enum/operation.status.enum';
import { PawapayService } from 'src/pawapay/pawapay.service';
import { UserRole } from 'src/users/enum/user-role-enum';
import { CollectShipmentBodyAdminDto } from './dto/collect-shipment-bodyAdmin.dto';
import { PaymentMethod } from 'src/operation/enum/payment-method.enum';
import { OtpEntity } from 'src/otp/entities/otp.entity';
import * as bcrypt from 'bcryptjs';
import { UserPlatformRoleEntity } from 'src/users/entities/user_plateform_roles.entity';
import { NotificationsService } from 'src/notification/notifications.service';
import { NotificationType } from 'src/notification/type/notification.type';
import { FilesService } from 'src/files/files.service';
import { PermissionHelper } from 'src/users/utility/helpers/permission.helper';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { PushNotificationHelper } from 'src/users/utility/helpers/push-notification.helper';
import { NotificationHelper } from 'src/notification/utils/notification.helper';
import { UserHasCompanyEntity } from 'src/user_has_company/entities/user_has_company.entity';
import { CompanyHasUserResource } from 'src/company_has_usrResource/entities/company_has_userResource.entity';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { I18nService } from 'src/libs/common/src';
import { FpayService } from 'src/fpay/fpay.service';
import { LoyaltySourceType, LoyaltyTier, LoyaltyTransactionType, UserLoyaltyEntity } from 'src/users/entities/user-loyalty.entity';
import { CompanySettingsEntity } from 'src/company/entities/company-settings.entity';
import { UserLoyaltyHistoryEntity } from 'src/users/entities/user-loyalty-history.entity';
import { InvoiceConfigurationEntity } from 'src/company/entities/invoice-configuration.entity';

@Injectable()
export class ShipmentService {
  constructor(
    @InjectRepository(Shipment)
    private shipmentRepo: Repository<Shipment>,
    @InjectRepository(PackageDetails)
    private packageRepo: Repository<PackageDetails>,
    @InjectRepository(TypeTransport)
    private transportRepo: Repository<TypeTransport>,
    @InjectRepository(OperationEntity)
    private operation: Repository<OperationEntity>,
    @InjectRepository(UserEntity, 'default')
    private userRepo: Repository<UserEntity>,
    @InjectRepository(OtpEntity)
    private readonly otpRepository: Repository<OtpEntity>,
    private readonly smsHelper: SmsHelper,
    private readonly mailService: MailOrderService,
    private readonly mailServic: MailService,
    private readonly cloudinary: CloudinaryService,
    private readonly dataSource: DataSource,
    private readonly pawapayService: PawapayService,
    @InjectRepository(UserPlatformRoleEntity)
    private readonly userPlatformRoleRepo: Repository<UserPlatformRoleEntity>,
    private readonly notificationsService: NotificationsService,
    private readonly filesService: FilesService,
    private readonly permissionHelper: PermissionHelper,
    @InjectRepository(BranchEntity)
    private readonly branchRepo: Repository<BranchEntity>,
    private readonly pushNotificationHelper: PushNotificationHelper,
    private readonly notificationHelper: NotificationHelper,
    @InjectRepository(UserHasCompanyEntity)
    private readonly userHasCompanyRepo: Repository<UserHasCompanyEntity>,
    @InjectRepository(CompanyHasUserResource)
    private readonly companyHasUserResourceRepo: Repository<CompanyHasUserResource>,

    @InjectRepository(UserLoyaltyEntity)
    private readonly userLoyaltyRepo: Repository<UserLoyaltyEntity>,

    @InjectRepository(CompanySettingsEntity)
    private readonly companySettingsRepo: Repository<CompanySettingsEntity>,

    @InjectRepository(UserLoyaltyHistoryEntity)
    private readonly loyaltyHistoryRepo: Repository<UserLoyaltyHistoryEntity>,

    @InjectRepository(CompanyEntity)
    private readonly companyRepo: Repository<CompanyEntity>,

    private readonly i18n: I18nService,
    private readonly fpayService: FpayService,

    @InjectRepository(InvoiceConfigurationEntity)
    private readonly invoiceConfigRepo: Repository<InvoiceConfigurationEntity>,

  ) { }

  // ----------------------------------------------------------------------
  // MÃ‰THODES PRIVÃ‰ES
  // ----------------------------------------------------------------------
  // Remplacer la mÃ©thode privÃ©e par :
  private async validateShipmentSections(dto: CreateShipmentDto, lang: string): Promise<string[]> {
    const errors: string[] = [];
    const isAnySectionEnabled =
      dto.pickupEnabled || dto.shippingEnabled || dto.deliveryEnabled;
    if (!isAnySectionEnabled) {
      errors.push(await this.i18n.translate('shipment.error.no_section_enabled', lang));
    }
    if (dto.shippingEnabled) {
      const requiredShippingFields = ['shippingFrom', 'shippingTo'] as const;
      for (const field of requiredShippingFields) {
        if (!dto[field] || dto[field].toString().trim() === '') {
          errors.push(await this.i18n.translate('shipment.error.shipping_field_required', lang, { field }));
        }
      }
    }
    if (dto.deliveryEnabled) {
      if (!dto.deliveryAddressId || dto.deliveryAddressId.toString().trim() === '') {
        errors.push(await this.i18n.translate('shipment.error.delivery_address_required', lang));
      }
    }
    return errors;
  }
  private async processShipmentNotifications(
    shipment: Shipment,
    packageEntity: PackageDetails,
    currentUser: UserEntity,
    lang: string,
  ): Promise<void> {
    try {
      const hasEmail = currentUser.email && currentUser.email.trim() !== '';
      const hasPhone = currentUser.phone && currentUser.phone.trim() !== '';

      const companiesToNotify: Array<{
        companyId: string;
        type: 'pickup' | 'shipping' | 'delivery';
        company: CompanyEntity | null | undefined;
      }> = [];

      if (shipment.pickupCompanyId) {
        companiesToNotify.push({
          companyId: shipment.pickupCompanyId,
          type: 'pickup',
          company: shipment.pickupCompany,
        });
      }
      if (shipment.shippingCompanyId) {
        companiesToNotify.push({
          companyId: shipment.shippingCompanyId,
          type: 'shipping',
          company: shipment.shippingCompany,
        });
      }
      if (shipment.deliveryCompanyId) {
        companiesToNotify.push({
          companyId: shipment.deliveryCompanyId,
          type: 'delivery',
          company: shipment.deliveryCompany,
        });
      }

      // ============================================================
      // âœ… CHARGER LA CONFIG DE FACTURE
      // PrioritÃ© : shippingCompany > pickupCompany > deliveryCompany
      // ============================================================
      let mainCompanyId: string | null = null;
      if (shipment.shippingCompanyId) {
        mainCompanyId = shipment.shippingCompanyId;
      } else if (shipment.pickupCompanyId) {
        mainCompanyId = shipment.pickupCompanyId;
      } else if (shipment.deliveryCompanyId) {
        mainCompanyId = shipment.deliveryCompanyId;
      }

      // ðŸ” LOG 1 : IDs des companies
      console.log('ðŸ” ============================================');
      console.log('ðŸ” [Invoice] Ã‰TAPE 1 â€” IDs des companies');
      console.log('ðŸ” ============================================');
      console.log('   shipment.pickupCompanyId   :', shipment.pickupCompanyId);
      console.log('   shipment.shippingCompanyId :', shipment.shippingCompanyId);
      console.log('   shipment.deliveryCompanyId :', shipment.deliveryCompanyId);
      console.log('   â†’ mainCompanyId retenu     :', mainCompanyId);
      console.log('ðŸ” ============================================');

      let invoiceConfig: InvoiceConfigurationEntity | null = null;
      if (mainCompanyId) {
        invoiceConfig = await this.invoiceConfigRepo.findOne({
          where: { companyId: mainCompanyId },
        });

        // ðŸ” LOG 2 : Config brute depuis la BDD
        console.log('ðŸ” ============================================');
        console.log('ðŸ” [Invoice] Ã‰TAPE 2 â€” Config chargÃ©e depuis la BDD');
        console.log('ðŸ” ============================================');
        console.log('   trouvÃ©e ?  :', !!invoiceConfig);
        if (invoiceConfig) {
          console.log('   id         :', invoiceConfig.id);
          console.log('   companyId  :', invoiceConfig.companyId);
          console.log('   logo       :', invoiceConfig.logo);
          console.log('   email      :', invoiceConfig.email);
          console.log('   phone      :', invoiceConfig.phone);
          console.log('   address    :', invoiceConfig.address);
          console.log('   rccm       :', invoiceConfig.rccm);
          console.log('   website    :', invoiceConfig.website);
        }
        console.log('ðŸ” ============================================');
      } else {
        console.log('âš ï¸ [Invoice] Aucun mainCompanyId â†’ pas de config Ã  charger');
      }

      const notificationOptions: any = {
        userId: currentUser.id,
        pushTitle: await this.i18n.translate(
          'shipment.push.created_title',
          lang,
        ),
        pushBody: await this.i18n.translate(
          'shipment.push.created_body',
          lang,
          {
            trackingNumber: shipment.trackingNumber,
          },
        ),
        pushData: { entity: 'SHIPMENT', entityId: shipment.id },
      };

      // ============================================================
      // ðŸ“§ EMAIL â€” Envoi de la facture PDF
      // ============================================================
      if (hasEmail) {
        notificationOptions.emailTo = currentUser.email;
        notificationOptions.emailSubject = await this.i18n.translate(
          'shipment.email.created_subject',
          lang,
        );
        notificationOptions.emailTemplate = 'shipment.ejs';
        notificationOptions.sendShipmentPdf = true;

        // âœ… Context COMPLET
        notificationOptions.emailContext = {
          shipment: shipment,
          package: packageEntity,
          lang: lang,
          user: currentUser,
          invoiceConfig: invoiceConfig,  // âœ… brut (peut Ãªtre null)

          translations: {
            shipment_title: await this.i18n.translate(
              'shipment.email.confirmation_title',
              lang,
            ),
            shipment: await this.i18n.translate(
              'shipment.email.waybill',
              lang,
            ),
            tracking: await this.i18n.translate(
              'shipment.email.tracking_number',
              lang,
            ),
            date: await this.i18n.translate('shipment.email.date', lang),

            status_pending: await this.i18n.translate(
              'shipment.status.pending',
              lang,
            ),
            status_in_transit: await this.i18n.translate(
              'shipment.status.in_transit',
              lang,
            ),
            status_delivered: await this.i18n.translate(
              'shipment.status.delivered',
              lang,
            ),
            status_cancelled: await this.i18n.translate(
              'shipment.status.cancelled',
              lang,
            ),

            description: await this.i18n.translate(
              'shipment.email.description',
              lang,
            ),
            quantity: await this.i18n.translate(
              'shipment.email.quantity',
              lang,
            ),
            weight: await this.i18n.translate('shipment.email.weight', lang),
            value: await this.i18n.translate('shipment.email.value', lang),
            fragile: await this.i18n.translate(
              'shipment.email.fragile',
              lang,
            ),

            yes: await this.i18n.translate('common.yes', lang),
            no: await this.i18n.translate('common.no', lang),

            pickup: await this.i18n.translate(
              'shipment.email.pickup_service',
              lang,
            ),
            shipping: await this.i18n.translate(
              'shipment.email.shipping_service',
              lang,
            ),
            delivery: await this.i18n.translate(
              'shipment.email.delivery_address',
              lang,
            ),
            from: await this.i18n.translate('shipment.email.from', lang),
            to: await this.i18n.translate('shipment.email.to', lang),
            contact: await this.i18n.translate(
              'shipment.email.contact',
              lang,
            ),
            phone: await this.i18n.translate('shipment.email.phone', lang),
            address: await this.i18n.translate(
              'shipment.email.address',
              lang,
            ),

            notes_conditions: await this.i18n.translate(
              'shipment.email.note_pdf',
              lang,
            ),
            shipment_note_1: await this.i18n.translate(
              'shipment.email.keep_document',
              lang,
            ),
            shipment_note_2: await this.i18n.translate(
              'shipment.email.present_on_pickup',
              lang,
            ),
            thank_you_footer: await this.i18n.translate(
              'shipment.email.thank_you',
              lang,
            ),
            legal_line_1: await this.i18n.translate(
              'shipment.email.footer_contact',
              lang,
            ),
            legal_line_2:
              'RCCM: CD/BN/RCCM/26-B-223 â€” NÂ°Tel : +243 991 225 122 â€” Email: contact@favorhelp.cd',
            legal_line_3: await this.i18n.translate(
              'shipment.email.official_document',
              lang,
            ),

            email: await this.i18n.translate('shipment.email.email', lang),
            website: await this.i18n.translate(
              'shipment.email.website',
              lang,
            ),
            invoice: await this.i18n.translate(
              'shipment.email.invoice',
              lang,
            ),
            package_details: await this.i18n.translate(
              'shipment.email.package_details',
              lang,
            ),

            shipment_invoice: await this.i18n.translate(
              'shipment.shipment_invoice',
              lang,
            ),
            number: await this.i18n.translate('shipment.number', lang),
            designation: await this.i18n.translate(
              'shipment.designation',
              lang,
            ),
            amount: await this.i18n.translate('shipment.amount', lang),
            unit_price: await this.i18n.translate(
              'shipment.unit_price',
              lang,
            ),
            payment_method: await this.i18n.translate(
              'shipment.payment_method',
              lang,
            ),
            cash: await this.i18n.translate('shipment.cash', lang),
            total_ht: await this.i18n.translate('shipment.total_ht', lang),
            vat: await this.i18n.translate('shipment.vat', lang),
            total_ttc: await this.i18n.translate(
              'shipment.total_ttc',
              lang,
            ),
            shipping_service: await this.i18n.translate(
              'shipment.shipping_service',
              lang,
            ),
            status_paid: await this.i18n.translate(
              'shipment.status_paid',
              lang,
            ),
            status_unpaid: await this.i18n.translate(
              'shipment.status_unpaid',
              lang,
            ),

            // âœ… Nouvelles clÃ©s pour les notes de conditions
            invoice_notes_title: await this.i18n.translate(
              'shipment.invoice_notes_title',
              lang,
            ),
            invoice_note_1: await this.i18n.translate(
              'shipment.invoice_note_1',
              lang,
            ),
            invoice_note_2: await this.i18n.translate(
              'shipment.invoice_note_2',
              lang,
            ),
            invoice_note_3: await this.i18n.translate(
              'shipment.invoice_note_3',
              lang,
            ),
          },
        };

        // ðŸ” LOG 4 : Ce qu'on envoie au helper
        console.log('ðŸ” ============================================');
        console.log('ðŸ” [Invoice] Ã‰TAPE 4 â€” emailContext prÃªt');
        console.log('ðŸ” ============================================');
        console.log(
          '   invoiceConfig prÃ©sent ? :',
          !!notificationOptions.emailContext.invoiceConfig,
        );
        console.log(
          '   invoiceConfig.logo      :',
          notificationOptions.emailContext.invoiceConfig?.logo,
        );
        console.log(
          '   invoiceConfig.email     :',
          notificationOptions.emailContext.invoiceConfig?.email,
        );
        console.log(
          '   invoiceConfig.phone     :',
          notificationOptions.emailContext.invoiceConfig?.phone,
        );
        console.log(
          '   invoiceConfig.address   :',
          notificationOptions.emailContext.invoiceConfig?.address,
        );
        console.log(
          '   invoiceConfig.rccm      :',
          notificationOptions.emailContext.invoiceConfig?.rccm,
        );
        console.log(
          '   invoiceConfig.website   :',
          notificationOptions.emailContext.invoiceConfig?.website,
        );
        console.log('ðŸ” ============================================');
      }

      // ============================================================
      // ðŸ“± SMS
      // ============================================================
      if (hasPhone) {
        notificationOptions.phoneNumber = currentUser.phone;
        notificationOptions.smsBody = await this.i18n.translate(
          'shipment.sms.created_body',
          lang,
          {
            trackingNumber: shipment.trackingNumber,
          },
        );
      }

      // âœ… Envoi (push + SMS + email)
      console.log('ðŸ“¤ [Invoice] Envoi via pushNotificationHelper.sendAll...');
      await this.pushNotificationHelper.sendAll(notificationOptions);
      console.log('âœ… [Invoice] sendAll terminÃ©');

      // ============================================================
      // ðŸ¢ Notifier les companies
      // ============================================================
      for (const companyInfo of companiesToNotify) {
        if (companyInfo.company) {
          await this.notificationsService.notifyShipmentCreatedForCompany(
            companyInfo.companyId,
            shipment.id,
            shipment.trackingNumber,
            shipment.status,
            companyInfo.type,
            companyInfo.company,
          );
        }
      }

      // ============================================================
      // ðŸ”” Notification in-app
      // ============================================================
      await this.notificationHelper.sendNotification(
        this.notificationsService,
        currentUser.id,
        NotificationType.SHIPMENT_CREATED,
        lang,
        {
          trackingNumber: shipment.trackingNumber,
          status: shipment.status,
          message: await this.i18n.translate(
            'shipment.inapp.created_message',
            lang,
            {
              trackingNumber: shipment.trackingNumber,
            },
          ),
        },
        'SHIPMENT',
        shipment.id,
      );
    } catch (error) {
      console.error('Erreur dans processShipmentNotifications:', error);
    }
  }

  private generateOperationReference(): string {
    const now = Date.now().toString(36).toUpperCase();
    const random = Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0');
    return `OP-${now}-${random}`;
  }
  private async getOrCreateLoyaltyAccount(userId: string): Promise<UserLoyaltyEntity> {
    // âœ… 1. VÃ‰RIFIER SI Ã‡A EXISTE
    const existingLoyalty = await this.userLoyaltyRepo.findOne({
      where: { userId },
    });

    // âœ… 2. SI EXISTE â†’ NE PAS CRÃ‰ER, RETOURNER
    if (existingLoyalty) {
      return existingLoyalty;
    }

    // âœ… 3. SINON â†’ GÃ‰NÃ‰RER UN CODE UNIQUE ET CRÃ‰ER
    let code: string;
    let exists: UserLoyaltyEntity | null = null;
    let attempts = 0;
    const maxAttempts = 10;

    do {
      code = Math.floor(10000000 + Math.random() * 90000000).toString();
      exists = await this.userLoyaltyRepo.findOne({
        where: { loyaltyCode: code },
      });
      attempts++;
    } while (exists && attempts < maxAttempts);

    if (exists) {
      code = Date.now().toString().slice(-8);
    }

    const loyalty = this.userLoyaltyRepo.create({
      userId,
      loyaltyCode: code,
      pointsBalance: 0,
      pointsTotalEarned: 0,
      pointsTotalSpent: 0,
      currentTier: LoyaltyTier.BRONZE,
      isActive: true,
    });

    try {
      return await this.userLoyaltyRepo.save(loyalty);
    } catch (error: any) {
      // âœ… 4. Si erreur de doublon (concurrence) â†’ retourner l'existant
      if (error.code === 'ER_DUP_ENTRY' || error.message?.includes('Duplicate')) {
        const existing = await this.userLoyaltyRepo.findOne({
          where: { userId },
        });
        if (existing) return existing;
      }
      throw error;
    }
  }

  // ----------------------------------------------------------------------
  // MÃ‰THODES PUBLIQUES
  // ----------------------------------------------------------------------
  async generateShipmentInvoiceByTrackingNumber(
    trackingNumber: string,
    lang: string = 'fr',
  ): Promise<{ pdfBuffer: Buffer; message: string }> {
    // 1. RÃ©cupÃ©rer le shipment avec toutes ses relations
    const shipment = await this.shipmentRepo.findOne({
      where: { trackingNumber },
      relations: [
        'package',
        'pickupTransportType',
        'user',
        'fournisseur',
        'trackings',
        'ltaShipments',
        'deliveryAddress',
        'pickupCompany',
        'shippingCompany',
        'deliveryCompany',
      ],
    });

    if (!shipment) {
      throw new NotFoundException(
        await this.i18n.translate('shipment.error.not_found', lang, {
          id: trackingNumber,
        }),
      );
    }

    // ============================================================
    // âœ… CHARGER LA CONFIG DE FACTURE
    // PrioritÃ© : shippingCompany > pickupCompany > deliveryCompany
    // ============================================================
    let mainCompanyId: string | null = null;
    if (shipment.shippingCompanyId) {
      mainCompanyId = shipment.shippingCompanyId;
    } else if (shipment.pickupCompanyId) {
      mainCompanyId = shipment.pickupCompanyId;
    } else if (shipment.deliveryCompanyId) {
      mainCompanyId = shipment.deliveryCompanyId;
    }

    console.log('ðŸ” ============================================');
    console.log('ðŸ” [Invoice] Ã‰TAPE 1 â€” IDs des companies');
    console.log('ðŸ” ============================================');
    console.log('   shipment.pickupCompanyId   :', shipment.pickupCompanyId);
    console.log('   shipment.shippingCompanyId :', shipment.shippingCompanyId);
    console.log('   shipment.deliveryCompanyId :', shipment.deliveryCompanyId);
    console.log('   â†’ mainCompanyId retenu     :', mainCompanyId);
    console.log('ðŸ” ============================================');

    let invoiceConfig: InvoiceConfigurationEntity | null = null;
    if (mainCompanyId) {
      invoiceConfig = await this.invoiceConfigRepo.findOne({
        where: { companyId: mainCompanyId },
      });

      console.log('ðŸ” ============================================');
      console.log('ðŸ” [Invoice] Ã‰TAPE 2 â€” Config chargÃ©e depuis la BDD');
      console.log('ðŸ” ============================================');
      console.log('   trouvÃ©e ?  :', !!invoiceConfig);
      if (invoiceConfig) {
        console.log('   id         :', invoiceConfig.id);
        console.log('   companyId  :', invoiceConfig.companyId);
        console.log('   logo       :', invoiceConfig.logo);
        console.log('   email      :', invoiceConfig.email);
        console.log('   phone      :', invoiceConfig.phone);
        console.log('   address    :', invoiceConfig.address);
        console.log('   rccm       :', invoiceConfig.rccm);
        console.log('   website    :', invoiceConfig.website);
      }
      console.log('ðŸ” ============================================');
    } else {
      console.log('âš ï¸ [Invoice] Aucun mainCompanyId â†’ pas de config Ã  charger');
    }

    // 2. PrÃ©parer les traductions pour le template
    const emailTranslations = {
      shipment_title: await this.i18n.translate('shipment.email.confirmation_title', lang),
      shipment_invoice: await this.i18n.translate('shipment.shipment_invoice', lang),
      shipment: await this.i18n.translate('shipment.email.waybill', lang),
      tracking: await this.i18n.translate('shipment.email.tracking_number', lang),
      date: await this.i18n.translate('shipment.email.date', lang),
      number: await this.i18n.translate('shipment.number', lang),

      status_pending: await this.i18n.translate('shipment.status.pending', lang),
      status_in_transit: await this.i18n.translate('shipment.status.in_transit', lang),
      status_delivered: await this.i18n.translate('shipment.status.delivered', lang),
      status_cancelled: await this.i18n.translate('shipment.status.cancelled', lang),

      package_details: await this.i18n.translate('shipment.email.package_details', lang),
      description: await this.i18n.translate('shipment.email.description', lang),
      quantity: await this.i18n.translate('shipment.email.quantity', lang),
      weight: await this.i18n.translate('shipment.email.weight', lang),
      value: await this.i18n.translate('shipment.email.value', lang),
      fragile: await this.i18n.translate('shipment.email.fragile', lang),
      dimensions: await this.i18n.translate('shipment.email.dimensions', lang),

      yes: await this.i18n.translate('common.yes', lang),
      no: await this.i18n.translate('common.no', lang),

      designation: await this.i18n.translate('shipment.designation', lang),
      unit_price: await this.i18n.translate('shipment.unit_price', lang),
      amount: await this.i18n.translate('shipment.amount', lang),

      pickup: await this.i18n.translate('shipment.email.pickup_service', lang),
      shipping: await this.i18n.translate('shipment.email.shipping_service', lang),
      delivery: await this.i18n.translate('shipment.email.delivery_address', lang),
      from: await this.i18n.translate('shipment.email.from', lang),
      to: await this.i18n.translate('shipment.email.to', lang),
      contact: await this.i18n.translate('shipment.email.contact', lang),
      phone: await this.i18n.translate('shipment.email.phone', lang),
      address: await this.i18n.translate('shipment.email.address', lang),

      payment_method: await this.i18n.translate('shipment.payment_method', lang),
      cash: await this.i18n.translate('shipment.cash', lang),
      total_ht: await this.i18n.translate('shipment.total_ht', lang),
      vat: await this.i18n.translate('shipment.vat', lang),
      total_ttc: await this.i18n.translate('shipment.total_ttc', lang),

      notes_conditions: await this.i18n.translate('shipment.email.note_pdf', lang),
      shipment_note_1: await this.i18n.translate('shipment.email.keep_document', lang),
      shipment_note_2: await this.i18n.translate('shipment.email.present_on_pickup', lang),
      thank_you_footer: await this.i18n.translate('shipment.email.thank_you', lang),
      legal_line_1: await this.i18n.translate('shipment.email.footer_contact', lang),
      legal_line_2: 'RCCM: CD/BN/RCCM/26-B-223 â€” NÂ°Tel : +243 991 225 122 â€” Email: contact@favorhelp.cd',
      legal_line_3: await this.i18n.translate('shipment.email.official_document', lang),

      status_paid: await this.i18n.translate('shipment.status_paid', lang),
      status_unpaid: await this.i18n.translate('shipment.status_unpaid', lang),

      // âœ… Nouvelles clÃ©s pour les notes de conditions
      invoice_notes_title: await this.i18n.translate('shipment.invoice_notes_title', lang),
      invoice_note_1: await this.i18n.translate('shipment.invoice_note_1', lang),
      invoice_note_2: await this.i18n.translate('shipment.invoice_note_2', lang),
      invoice_note_3: await this.i18n.translate('shipment.invoice_note_3', lang),
    };

    // âœ… Fallback user
    const templateUser = shipment.user
      ? shipment.user
      : {
        fullName: shipment.clientName || 'Client',
        email: '',
        phone: shipment.clientPhone || '',
      };

    console.log('ðŸ” [Invoice] Ã‰TAPE 3 â€” User du template :', {
      hasShipmentUser: !!shipment.user,
      fullName: templateUser.fullName,
      email: templateUser.email,
      phone: templateUser.phone,
    });

    // 3. GÃ©nÃ©rer le PDF
    const pdfBuffer = await this.mailService.generatePdfFromTemplate('shipment.ejs', {
      shipment,
      package: shipment.package,
      user: templateUser,
      lang,
      translations: emailTranslations,
      invoiceConfig,
    });

    return {
      pdfBuffer,
      message: await this.i18n.translate('shipment.invoice_generated_success', lang),
    };
  }

  async create(
    createShipmentDto: CreateShipmentDto,
    currentUser: UserEntity,
    lang: string = 'fr',
  ): Promise<{ message: string; data: Shipment }> {
    const {
      pickupEnabled = false,
      shippingEnabled = false,
      deliveryEnabled = false,
      pickupTransportTypeId,
      pickupFrom,
      pickupTo,
      pickupContactName,
      pickupContactPhone,
      shippingFrom,
      shippingTo,
      paymentMethod,
      whatsapp_number,
      deliveryAddressId,
      description,
      external_quantity,
      weight,
      length,
      dimensions,
      internal_quantity,
      value,
      fragile,
      pickupCompanyId,
      shippingCompanyId,
      deliveryCompanyId,
    } = createShipmentDto;

    const validationErrors = await this.validateShipmentSections(createShipmentDto, lang);
    if (validationErrors.length > 0) {
      throw new BadRequestException(validationErrors);
    }

    const trackingNumber = TrackingNumberUtil.generate();
    const shipment = new Shipment();

    if (pickupEnabled && shippingEnabled) {
      shipment.status = ShipmentStatus.PENDING;
    } else if (pickupEnabled) {
      shipment.status = ShipmentStatus.PENDING;
    } else if (shippingEnabled) {
      shipment.status = ShipmentStatus.AT_ORIGIN_AGENCY;
    } else {
      shipment.status = ShipmentStatus.PENDING;
    }

    shipment.trackingNumber = trackingNumber;
    shipment.userId = currentUser.id;
    shipment.pickupEnabled = pickupEnabled;
    shipment.shippingEnabled = shippingEnabled;
    shipment.deliveryEnabled = deliveryEnabled;
    shipment.whatsapp_number = whatsapp_number;
    shipment.paymentMethod = paymentMethod;

    // ðŸ”¹ RÃ‰CUPÃ‰RER ET ASSIGNER LE CODE DE FIDÃ‰LITÃ‰ DE L'UTILISATEUR CONNECTÃ‰
    if (currentUser.id) {
      const userLoyalty = await this.userLoyaltyRepo.findOne({
        where: { userId: currentUser.id, isActive: true },
      });
      if (userLoyalty) {
        shipment.loyaltyCode = userLoyalty.loyaltyCode;
      }
    }

    if (pickupCompanyId) shipment.pickupCompanyId = pickupCompanyId;
    if (shippingCompanyId) shipment.shippingCompanyId = shippingCompanyId;
    if (deliveryCompanyId) shipment.deliveryCompanyId = deliveryCompanyId;

    if (pickupEnabled) {
      if (pickupFrom) shipment.pickupFrom = pickupFrom;
      if (pickupTo) shipment.pickupTo = pickupTo;
      if (pickupContactName) shipment.pickupContactName = pickupContactName;
      if (pickupContactPhone) shipment.pickupContactPhone = pickupContactPhone;
      if (pickupTransportTypeId) {
        const pickupTransport = await this.transportRepo.findOne({
          where: { id: pickupTransportTypeId },
        });
        if (!pickupTransport) {
          throw new NotFoundException(
            await this.i18n.translate('shipment.error.transport_not_found', lang, { id: pickupTransportTypeId }),
          );
        }
        shipment.pickupTransportType = pickupTransport;
        shipment.pickupTransportTypeId = pickupTransportTypeId;
      }
    }

    if (shippingEnabled) {
      if (shippingFrom) shipment.shippingFrom = shippingFrom;
      if (shippingTo) shipment.shippingTo = shippingTo;
    }

    if (deliveryEnabled && deliveryAddressId) {
      shipment.deliveryAddressId = deliveryAddressId;
    }

    const savedShipment = await this.shipmentRepo.save(shipment);

    if (!description || external_quantity === undefined) {
      throw new BadRequestException(
        await this.i18n.translate('shipment.error.package_fields_required', lang),
      );
    }

    const packageEntity = this.packageRepo.create({
      description,
      external_quantity,
      weight,
      length,
      dimensions,
      internal_quantity,
      value,
      fragile: fragile ?? false,
      shipment: { id: savedShipment.id } as any,
    });
    await this.packageRepo.save(packageEntity);

    const relations = [
      'package',
      'pickupTransportType',
      'user',
      'trackings',
      'ltaShipments',
      'deliveryAddress',
      'pickupCompany',
      'shippingCompany',
      'deliveryCompany',
    ];

    const shipmentWithRelations = await this.shipmentRepo.findOneOrFail({
      where: { id: savedShipment.id },
      relations,
    });

    this.processShipmentNotifications(shipmentWithRelations, packageEntity, currentUser, lang).catch((err) =>
      console.error('Erreur notifications colis:', err),
    );

    return {
      message: await this.i18n.translate('shipment.create_success', lang),
      data: shipmentWithRelations,
    };
  }

  async createByAdmin(
    dto: CreateShipmentAdminDto,
    file: Express.Multer.File | undefined,
    currentUser: UserEntity,
    lang: string = 'fr',
  ): Promise<{ message: string; data: Shipment }> {
    const {
      userId,
      clientName,
      clientPhone,
      pickupEnabled = false,
      shippingEnabled = false,
      deliveryEnabled = false,
      pickupTransportTypeId,
      status = ShipmentStatus.AT_ORIGIN_AGENCY,
      pickupFrom,
      pickupTo,
      pickupContactName,
      pickupContactPhone,
      shippingFrom,
      shippingTo,
      deliveryAddressId,
      paymentMethod,
      whatsapp_number,
      description,
      external_quantity,
      weight,
      length,
      dimensions,
      internal_quantity,
      value,
      fragile,
      pickupPrice,
      shippingPrice,
      deliveryPrice,
      totalPrice,
      pickupCompanyId,
      shippingCompanyId,
      deliveryCompanyId,
      supplierPhone,
      isPaid = false,
      supplierName,
    } = dto;

    if (!currentUser.activeCompanyId) {
      throw new BadRequestException(
        await this.i18n.translate('shipment.error.no_active_company', lang),
      );
    }

    if (!clientName || clientName.trim() === '') {
      throw new BadRequestException(
        await this.i18n.translate('shipment.error.client_name_required', lang),
      );
    }

    if (!userId && (!clientPhone || clientPhone.trim() === '')) {
      throw new BadRequestException(
        await this.i18n.translate('shipment.error.client_phone_required', lang),
      );
    }

    const validationErrors = await this.validateShipmentSections(dto, lang);
    if (validationErrors.length > 0) {
      throw new BadRequestException(validationErrors);
    }

    const trackingNumber = TrackingNumberUtil.generate();
    const shipment = new Shipment();
    shipment.trackingNumber = trackingNumber;
    shipment.status = status;
    shipment.pickupEnabled = pickupEnabled;
    shipment.shippingEnabled = shippingEnabled;
    shipment.deliveryEnabled = deliveryEnabled;
    shipment.whatsapp_number = whatsapp_number;
    shipment.paymentMethod = paymentMethod;
    shipment.isPaid = isPaid ?? false;
    shipment.paid = isPaid ?? false;

    // ============================================================
    // ðŸ”¹ 1. CLIENT via clientPhone
    //     â†’ Chercher par phone dans `user`
    //     â†’ Si trouvÃ© : rÃ©cupÃ©rer ses infos (nom, email...)
    //     â†’ Si non trouvÃ© : crÃ©er
    // ============================================================
    let clientUser: UserEntity | null = null;

    if (clientPhone && clientPhone.trim() !== '') {
      try {
        const normalizedClientPhone = clientPhone.trim();
        const isValidPhone = /^\+?[0-9\s\-()]{7,20}$/.test(normalizedClientPhone);

        if (!isValidPhone) {
          console.log(`âš ï¸ [Shipment] Format clientPhone invalide: ${normalizedClientPhone} â†’ ignorÃ©`);
        } else {
          // âœ… 1a. Chercher par phone (peu importe le rÃ´le)
          clientUser = await this.userRepo.findOne({
            where: { phone: normalizedClientPhone },
          });

          if (clientUser) {
            // âœ… 1b. Client trouvÃ© â†’ rÃ©cupÃ©rer ses infos
            console.log(`â„¹ï¸ [Shipment] Client existant trouvÃ©: ${clientUser.id} (${clientUser.fullName})`);
            console.log(`   - Email: ${clientUser.email || 'N/A'}`);
            console.log(`   - Phone: ${clientUser.phone}`);

            // âœ… Mettre Ã  jour le nom du client avec celui de la commande
            //    (le formulaire peut avoir fourni un nom plus rÃ©cent)
            if (clientName && clientName.trim() !== '') {
              shipment.clientName = clientName.trim();
            } else {
              shipment.clientName = clientUser.fullName;
            }
          } else {
            // âœ… 1c. Client non trouvÃ© â†’ crÃ©er
            console.log(`âš ï¸ [Shipment] Aucun client avec ${normalizedClientPhone} â†’ crÃ©ation`);

            const defaultClientPassword = await bcrypt.hash(
              process.env.DEFAULT_CLIENT_PASSWORD || 'FavorHelp2024!',
              10,
            );

            const newClient = this.userRepo.create({
              fullName: clientName || `Client ${normalizedClientPhone.slice(-4)}`,
              phone: normalizedClientPhone,
              password: defaultClientPassword,
              role: UserRole.CUSTOMER,
              isActive: true,
              provider: 'auto-created',
              country: currentUser.country || 'CD',
              city: currentUser.city || 'Goma',
            });

            clientUser = await this.userRepo.save(newClient);
            console.log(`âœ… [Shipment] Nouveau client crÃ©Ã©: ${clientUser.id} (${clientUser.fullName})`);

            shipment.clientName = clientUser.fullName;
            try {
              const smsMessage = await this.i18n.translate('shipment.sms.account_created', lang, {
                phone: normalizedClientPhone,
                password: defaultClientPassword,
              });

              await this.smsHelper.sendSms(normalizedClientPhone, smsMessage);

              console.log(`ðŸ“± [Shipment] SMS identifiants CLIENT envoyÃ© Ã  ${normalizedClientPhone}`);
            } catch (smsError: any) {
              console.error(`âŒ [Shipment] Erreur envoi SMS identifiants CLIENT:`, smsError.message);
              // Ne pas bloquer le flux
            }
          }

          // âœ… 1d. RÃ©cupÃ©rer ou crÃ©er le loyalty code
          let clientLoyalty = await this.userLoyaltyRepo.findOne({
            where: { userId: clientUser.id, isActive: true },
          });

          if (!clientLoyalty) {
            clientLoyalty = await this.getOrCreateLoyaltyAccount(clientUser.id);
          }

          if (clientLoyalty?.loyaltyCode) {
            shipment.loyaltyCode = clientLoyalty.loyaltyCode;
            console.log(`âœ… [Shipment] loyaltyCode (client): ${clientLoyalty.loyaltyCode}`);
          }

          shipment.userId = clientUser.id;
        }
      } catch (error: any) {
        console.error(`âŒ [Shipment] Erreur client:`, {
          message: error.message,
          code: error.code,
          detail: error.detail,
        });
      }
    }

    // âœ… Fallback : si clientPhone non fourni mais userId oui
    if (!clientUser && userId) {
      try {
        clientUser = await this.userRepo.findOne({ where: { id: userId } });

        if (clientUser) {
          console.log(`â„¹ï¸ [Shipment] Client trouvÃ© via userId: ${clientUser.id} (${clientUser.fullName})`);

          let clientLoyalty = await this.userLoyaltyRepo.findOne({
            where: { userId: clientUser.id, isActive: true },
          });

          if (!clientLoyalty) {
            clientLoyalty = await this.getOrCreateLoyaltyAccount(clientUser.id);
          }

          if (clientLoyalty?.loyaltyCode) {
            shipment.loyaltyCode = clientLoyalty.loyaltyCode;
          }

          shipment.userId = clientUser.id;
          shipment.clientName = clientUser.fullName;
        }
      } catch (error: any) {
        console.error(`âŒ [Shipment] Erreur loyalty via userId:`, error.message);
      }
    }

    // ============================================================
    // ðŸ”¹ 2. FOURNISSEUR via supplierPhone
    //     â†’ Chercher par phone dans `user`
    //     â†’ Si trouvÃ© : rÃ©cupÃ©rer ses infos
    //     â†’ Si non trouvÃ© : crÃ©er
    //     âœ… INDÃ‰PENDANT DU CLIENT
    // ============================================================
    if (supplierPhone && supplierPhone.trim() !== '') {
      try {
        const normalizedPhone = supplierPhone.trim();

        // âœ… 2a. Chercher par phone dans user (peu importe le rÃ´le)
        let fournisseurUser = await this.userRepo.findOne({
          where: { phone: normalizedPhone },
        });

        if (fournisseurUser) {
          // âœ… 2b. Fournisseur trouvÃ© â†’ rÃ©cupÃ©rer ses infos
          console.log(`â„¹ï¸ [Shipment] Fournisseur existant trouvÃ©: ${fournisseurUser.id} (${fournisseurUser.fullName})`);
          console.log(`   - Email: ${fournisseurUser.email || 'N/A'}`);
          console.log(`   - Phone: ${fournisseurUser.phone}`);
        } else {
          // âœ… 2c. Fournisseur non trouvÃ© â†’ crÃ©er
          console.log(`âš ï¸ [Shipment] Aucun fournisseur avec ${normalizedPhone} â†’ crÃ©ation`);

          const finalFournisseurName =
            supplierName && supplierName.trim() !== ''
              ? supplierName.trim()
              : `Fournisseur ${normalizedPhone.slice(-4)}`;

          const defaultPassword = await bcrypt.hash(
            process.env.DEFAULT_SUPPLIER_PASSWORD || 'FavorHelp2024!',
            10,
          );

          const newFournisseur = this.userRepo.create({
            fullName: finalFournisseurName,
            phone: normalizedPhone,
            password: defaultPassword,
            role: UserRole.CUSTOMER,
            isActive: true,
            provider: 'auto-created',
            country: currentUser.country || 'CD',
            city: currentUser.city || 'Goma',
          });

          fournisseurUser = await this.userRepo.save(newFournisseur);
          console.log(`âœ… [Shipment] Nouveau fournisseur crÃ©Ã©: ${fournisseurUser.id} (${fournisseurUser.fullName})`);
          try {
            const smsMessage = await this.i18n.translate('shipment.sms.account_created', lang, {
              phone: normalizedPhone,
              password: defaultPassword,
            });

            await this.smsHelper.sendSms(normalizedPhone, smsMessage);

            console.log(`ðŸ“± [Shipment] SMS identifiants FOURNISSEUR envoyÃ© Ã  ${normalizedPhone}`);
          } catch (smsError: any) {
            console.error(`âŒ [Shipment] Erreur envoi SMS identifiants FOURNISSEUR:`, smsError.message);
            // Ne pas bloquer le flux
          }
        }

        // âœ… 2d. Assigner les infos rÃ©cupÃ©rÃ©es ou crÃ©Ã©es
        shipment.fournisseurId = fournisseurUser.id;
        shipment.fournisseurName = fournisseurUser.fullName;
        shipment.fournisseurPhone = normalizedPhone;

        // âœ… 2e. RÃ©cupÃ©rer ou crÃ©er le loyalty code
        let fournisseurLoyalty = await this.userLoyaltyRepo.findOne({
          where: { userId: fournisseurUser.id, isActive: true },
        });

        if (!fournisseurLoyalty) {
          fournisseurLoyalty = await this.getOrCreateLoyaltyAccount(fournisseurUser.id);
        }

        if (fournisseurLoyalty?.loyaltyCode) {
          shipment.loyaltyCodeFournisseur = fournisseurLoyalty.loyaltyCode;
          console.log(`âœ… [Shipment] loyaltyCodeFournisseur: ${fournisseurLoyalty.loyaltyCode}`);
        }
      } catch (error: any) {
        console.error(`âŒ [Shipment] Erreur fournisseur:`, {
          message: error.message,
          code: error.code,
          detail: error.detail,
        });
        shipment.fournisseurPhone = supplierPhone.trim();
      }
    }

    if (pickupEnabled) {
      shipment.pickupCompanyId = pickupCompanyId && pickupCompanyId.trim() !== '' ? pickupCompanyId : currentUser.activeCompanyId;
    }
    if (shippingEnabled) {
      shipment.shippingCompanyId = shippingCompanyId && shippingCompanyId.trim() !== '' ? shippingCompanyId : currentUser.activeCompanyId;
    }
    if (deliveryEnabled) {
      shipment.deliveryCompanyId = deliveryCompanyId && deliveryCompanyId.trim() !== '' ? deliveryCompanyId : currentUser.activeCompanyId;
    }

    if (file) {
      const uploadedFile = await this.filesService.uploadFile(file, 'shipment', 'product');
      shipment.image = uploadedFile.data;
    }

    let targetUser: UserEntity | null = clientUser;

    if (!targetUser && userId) {
      targetUser = await this.userRepo.findOne({ where: { id: userId } });
      if (!targetUser) {
        throw new NotFoundException(
          await this.i18n.translate('shipment.error.user_not_found', lang, { id: userId }),
        );
      }
      shipment.userId = targetUser.id;
    } else if (!targetUser && clientPhone) {
      const foundUser = await this.userRepo.findOne({ where: { phone: clientPhone } });
      if (foundUser) {
        targetUser = foundUser;
        shipment.userId = targetUser.id;
      }
    } else if (targetUser) {
      shipment.userId = targetUser.id;
    }

    // âœ… Remplir clientName / clientPhone
    if (!shipment.clientName) {
      shipment.clientName = clientName || clientUser?.fullName;
    }
    shipment.clientPhone = clientPhone || undefined;

    if (pickupEnabled) {
      if (pickupFrom) shipment.pickupFrom = pickupFrom;
      if (pickupTo) shipment.pickupTo = pickupTo;
      if (pickupContactName) shipment.pickupContactName = pickupContactName;
      if (pickupContactPhone) shipment.pickupContactPhone = pickupContactPhone;
      if (status) shipment.status = ShipmentStatus.AT_ORIGIN_AGENCY;
      if (pickupTransportTypeId) {
        const pickupTransport = await this.transportRepo.findOne({
          where: { id: pickupTransportTypeId },
        });
        if (!pickupTransport) {
          throw new NotFoundException(
            await this.i18n.translate('shipment.error.transport_not_found', lang, { id: pickupTransportTypeId }),
          );
        }
        shipment.pickupTransportType = pickupTransport;
        shipment.pickupTransportTypeId = pickupTransportTypeId;
      }
    }
    if (shippingEnabled) {
      if (shippingFrom) shipment.shippingFrom = shippingFrom;
      if (shippingTo) shipment.shippingTo = shippingTo;
      if (status) shipment.status = ShipmentStatus.AT_ORIGIN_AGENCY;
    }
    if (deliveryEnabled && deliveryAddressId) {
      shipment.deliveryAddressId = deliveryAddressId;
    }

    if (pickupPrice !== undefined) shipment.pickupPrice = pickupPrice;
    if (shippingPrice !== undefined) shipment.shippingPrice = shippingPrice;
    if (deliveryPrice !== undefined) shipment.deliveryPrice = deliveryPrice;
    shipment.totalPrice = totalPrice ?? (pickupPrice ?? 0) + (shippingPrice ?? 0) + (deliveryPrice ?? 0);

    const savedShipment = await this.shipmentRepo.save(shipment);

    if (!description || external_quantity === undefined) {
      throw new BadRequestException(
        await this.i18n.translate('shipment.error.package_fields_required', lang),
      );
    }
    const packageEntity = this.packageRepo.create({
      description,
      external_quantity,
      weight,
      length,
      dimensions,
      internal_quantity,
      value,
      fragile: fragile ?? false,
      shipment: { id: savedShipment.id } as any,
    });
    await this.packageRepo.save(packageEntity);

    // ============================================================
    // ðŸ’° PAIEMENT FIDÃ‰LITÃ‰ AUTOMATIQUE SI isPaid = true
    // ============================================================
    const amountForLoyalty = shipment.totalPrice || 0;

    if (amountForLoyalty > 0) {
      try {
        console.log(`ðŸ’° [Shipment] Paiement fidÃ©litÃ© dÃ©clenchÃ© (montant: ${amountForLoyalty}, isPaid: ${isPaid})`);

        shipment.pin = GeneratePin.generate();
        shipment.collectedAt = new Date();
        await this.shipmentRepo.save(shipment);

        let loyaltyFeePercentage = 0;
        let mainCompany: CompanyEntity | null = shipment.shippingCompanyId
          ? await this.companyRepo.findOne({ where: { id: shipment.shippingCompanyId } })
          : null;

        if (!mainCompany && shipment.pickupCompanyId) {
          mainCompany = await this.companyRepo.findOne({ where: { id: shipment.pickupCompanyId } });
        }
        if (!mainCompany && shipment.deliveryCompanyId) {
          mainCompany = await this.companyRepo.findOne({ where: { id: shipment.deliveryCompanyId } });
        }

        if (mainCompany) {
          const companySettings = await this.companySettingsRepo.findOne({
            where: { companyId: mainCompany.id },
          });

          loyaltyFeePercentage = companySettings?.loyaltyFeeFixed || 5.00;
          console.log(`[Fidelity] ðŸ” Pourcentage: ${loyaltyFeePercentage}%`);
        } else {
          loyaltyFeePercentage = 5.00;
          console.log(`[Fidelity] âš ï¸ Aucune company â†’ 5% par dÃ©faut`);
        }

        const totalFees = (amountForLoyalty * loyaltyFeePercentage) / 100;
        const loyaltyFeeClient = totalFees / 2;
        const loyaltyFeeFournisseur = totalFees / 2;

        console.log(`[Fidelity] ðŸ’° RÃ©partition:`, {
          totalFees,
          loyaltyFeeClient,
          loyaltyFeeFournisseur,
        });

        // ============================================================
        // âœ… Paiement au CLIENT â€” UNIQUEMENT si isPaid === true
        // ============================================================
        if (isPaid === true && shipment.loyaltyCode && loyaltyFeeClient > 0) {
          const userLoyalty = await this.userLoyaltyRepo.findOne({
            where: { loyaltyCode: shipment.loyaltyCode, isActive: true },
            relations: ['user'],
          });

          if (userLoyalty?.user?.userIdFpay) {
            try {
              const fpayResponse = await this.fpayService.makeSend(
                {
                  userId: userLoyalty.user.userIdFpay,
                  amount: loyaltyFeeClient,
                  description: `Frais de fidÃ©litÃ© (50%) pour le colis ${shipment.trackingNumber}`,
                  currency: 'USD',
                  countryCode: 'CD',
                },
                currentUser,
              );

              if (fpayResponse?.data?.transaction?.status === 'SUCCESS') {
                const loyaltyHistory = this.loyaltyHistoryRepo.create({
                  userId: userLoyalty.user.id,
                  loyaltyId: userLoyalty.id,
                  transactionType: LoyaltyTransactionType.EARN,
                  sourceType: LoyaltySourceType.SHIPMENT,
                  sourceId: shipment.id,
                  description: `Frais de fidÃ©litÃ© (50%) pour l'expÃ©dition ${shipment.trackingNumber}`,
                });
                await this.loyaltyHistoryRepo.save(loyaltyHistory);

                userLoyalty.pointsBalance += Math.round(loyaltyFeeClient * 100);
                userLoyalty.pointsTotalEarned += Math.round(loyaltyFeeClient * 100);
                await this.userLoyaltyRepo.save(userLoyalty);

                console.log(`[Fidelity] âœ… ${loyaltyFeeClient} USD envoyÃ© au CLIENT`);
              }
            } catch (err: any) {
              console.error(`[Fidelity] âŒ Erreur paiement client:`, err.message);
            }
          }
        } else if (isPaid !== true) {
          console.log(`[Fidelity] â­ï¸ isPaid = false â†’ client non payÃ© automatiquement`);
        }

        // ============================================================
        // âœ… Paiement au FOURNISSEUR â€” dÃ¨s qu'il est prÃ©sent (peu importe isPaid)
        // ============================================================
        if (shipment.loyaltyCodeFournisseur && loyaltyFeeFournisseur > 0) {
          const fournisseurLoyalty = await this.userLoyaltyRepo.findOne({
            where: { loyaltyCode: shipment.loyaltyCodeFournisseur, isActive: true },
            relations: ['user'],
          });

          if (fournisseurLoyalty?.user?.userIdFpay) {
            try {
              const fpayResponse = await this.fpayService.makeSend(
                {
                  userId: fournisseurLoyalty.user.userIdFpay,
                  amount: loyaltyFeeFournisseur,
                  description: `Frais de fidÃ©litÃ© (50%) fournisseur pour le colis ${shipment.trackingNumber}`,
                  currency: 'USD',
                  countryCode: 'CD',
                },
                currentUser,
              );

              if (fpayResponse?.data?.transaction?.status === 'SUCCESS') {
                const loyaltyHistory = this.loyaltyHistoryRepo.create({
                  userId: fournisseurLoyalty.user.id,
                  loyaltyId: fournisseurLoyalty.id,
                  transactionType: LoyaltyTransactionType.EARN,
                  sourceType: LoyaltySourceType.SHIPMENT,
                  sourceId: shipment.id,
                  description: `Frais de fidÃ©litÃ© (50%) fournisseur pour l'expÃ©dition ${shipment.trackingNumber}`,
                });
                await this.loyaltyHistoryRepo.save(loyaltyHistory);

                fournisseurLoyalty.pointsBalance += Math.round(loyaltyFeeFournisseur * 100);
                fournisseurLoyalty.pointsTotalEarned += Math.round(loyaltyFeeFournisseur * 100);
                await this.userLoyaltyRepo.save(fournisseurLoyalty);

                console.log(`[Fidelity] âœ… ${loyaltyFeeFournisseur} USD envoyÃ© au FOURNISSEUR`);
              }
            } catch (err: any) {
              console.error(`[Fidelity] âŒ Erreur paiement fournisseur:`, err.message);
            }
          }
        } else {
          console.log(`[Fidelity] â­ï¸ Pas de fournisseur â†’ pas de paiement fournisseur`);
        }

        await this.operation.save({
          debit: amountForLoyalty,
          credit: 0,
          shipmentId: shipment.id,
          designation: await this.i18n.translate('shipment.operation.admin_payment_designation', lang, {
            trackingNumber: shipment.trackingNumber,
          }),
          status: OperationStatus.ACCEPTED,
          userId: currentUser.id,
          paymentMethod: PaymentMethod.CASH,
          provider: 'ADMIN_AUTO_PAID',
          reference: this.generateOperationReference(),
        });

        console.log(`[Fidelity] âœ… Paiement fidÃ©litÃ© complet pour ${shipment.trackingNumber}`);
      } catch (err: any) {
        console.error(`âŒ [Fidelity] Erreur globale paiement fidÃ©litÃ©:`, err.message);
      }
    } else {
      console.log(`[Fidelity] â­ï¸ Montant = 0 â†’ aucun frais de fidÃ©litÃ© pour ${shipment.trackingNumber}`);
    }

    const relations = [
      'package',
      'pickupTransportType',
      'user',
      'fournisseur',
      'trackings',
      'ltaShipments',
      'deliveryAddress',
      'pickupCompany',
      'shippingCompany',
      'deliveryCompany',
    ];
    const shipmentWithRelations = await this.shipmentRepo.findOneOrFail({
      where: { id: savedShipment.id },
      relations,
    });

    // ============================================================
    // ðŸ“§ NOTIFICATIONS - BasÃ© sur le client RÃ‰EL (rÃ©cupÃ©rÃ© ou crÃ©Ã©)
    // ============================================================

    // âœ… AJOUT : LOGS DE DEBUG POUR L'EMAIL
    console.log(`\nðŸ” ============================================`);
    console.log(`ðŸ” [DEBUG] Ã‰TAT AVANT NOTIFICATIONS`);
    console.log(`ðŸ” ============================================`);
    console.log(`ðŸ” clientUser:`, {
      id: clientUser?.id,
      fullName: clientUser?.fullName,
      email: clientUser?.email,
      phone: clientUser?.phone,
      hasEmail: !!(clientUser?.email && clientUser.email.trim() !== ''),
    });
    console.log(`ðŸ” targetUser:`, {
      id: targetUser?.id,
      fullName: targetUser?.fullName,
      email: targetUser?.email,
      phone: targetUser?.phone,
      hasEmail: !!(targetUser?.email && targetUser.email.trim() !== ''),
    });
    console.log(`ðŸ” ============================================\n`);

    if (clientUser) {
      // âœ… Passer clientUser (qui contient email Ã  jour)
      console.log(`ðŸ“§ [DEBUG] Appel processShipmentNotifications avec clientUser:`);
      console.log(`   - ID: ${clientUser.id}`);
      console.log(`   - Nom: ${clientUser.fullName}`);
      console.log(`   - Email: ${clientUser.email || 'N/A'}`);
      console.log(`   - Phone: ${clientUser.phone || 'N/A'}`);

      this.processShipmentNotifications(shipmentWithRelations, packageEntity, clientUser, lang).catch((err) =>
        console.error('Erreur notifications colis:', err),
      );
    } else if (clientPhone) {
      console.log(`âš ï¸ [DEBUG] Pas de clientUser â†’ envoi SMS anonyme Ã  ${clientPhone}`);
      const finalTrackingNumber = shipmentWithRelations.trackingNumber || trackingNumber;
      const smsMessage = await this.i18n.translate('shipment.sms.created_anonymous', lang, {
        trackingNumber: finalTrackingNumber,
      });
      await this.smsHelper.sendSms(clientPhone, smsMessage).catch((err) => console.error('Erreur envoi SMS anonyme:', err));
    }

    return {
      message: await this.i18n.translate('shipment.create_admin_success', lang),
      data: shipmentWithRelations,
    };
  }


  async updateByAdmin(
    id: string,
    dto: UpdateShipmentAdminDto,
    file: Express.Multer.File | undefined,
    currentUser: UserEntity,
    lang: string = 'fr',
  ): Promise<{ message: string; data: Shipment }> {
    const shipment = await this.shipmentRepo.findOne({
      where: { id },
      relations: [
        'package',
        'pickupTransportType',
        'user',
        'fournisseur',
        'trackings',
        'ltaShipments',
        'pickupCompany',
        'shippingCompany',
        'deliveryCompany',
      ],
    });
    if (!shipment) throw new NotFoundException(await this.i18n.translate('shipment.error.not_found', lang, { id }));

    // ============================================================
    // âœ… CAPTURER L'Ã‰TAT AVANT MODIFICATION
    // ============================================================
    const previousState = {
      userId: shipment.userId,
      clientPhone: shipment.clientPhone || null,
      fournisseurId: shipment.fournisseurId,
      fournisseurPhone: shipment.fournisseurPhone || null,
      isPaid: shipment.isPaid,
      paid: shipment.isPaid,
    };

    console.log(`ðŸ” [Shipment] Ã‰tat AVANT modification:`, previousState);

    // ============================================================
    // ðŸ”¹ USER / CLIENT (via userId direct)
    // ============================================================
    // âœ… CORRECTION : appliquer clientName / clientPhone TOUJOURS
    //    avant la logique userId, pour ne pas les effacer
    if (dto.clientName !== undefined) {
      shipment.clientName = dto.clientName;
    }
    if (dto.clientPhone !== undefined) {
      shipment.clientPhone = dto.clientPhone;
    }

    if (dto.userId) {
      const user = await this.userRepo.findOneBy({ id: dto.userId });
      if (!user) throw new NotFoundException(await this.i18n.translate('shipment.error.user_not_found', lang, { id: dto.userId }));
      shipment.userId = user.id;

      // âš ï¸ On n'efface plus automatiquement clientName/clientPhone.
      //    Si tu veux effacer, il faut le faire explicitement cÃ´tÃ© DTO.
      // shipment.clientName = undefined;
      // shipment.clientPhone = undefined;
    }

    // ============================================================
    // ðŸ”¹ DÃ‰TECTION DU CHANGEMENT CLIENT
    //    âœ… Payer UNIQUEMENT si : ancien VIDE â†’ nouveau REMPLI
    //    âŒ Ne PAS payer si : remplacÃ© / retirÃ© / inchangÃ©
    // ============================================================
    let clientShouldBePaid = false;

    const oldClientPhone = (previousState.clientPhone || '').trim();
    const newClientPhone = (dto.clientPhone || shipment.clientPhone || '').trim();

    const clientWasEmpty = oldClientPhone === '';
    const clientIsNowFilled = newClientPhone !== '';

    if (clientWasEmpty && clientIsNowFilled) {
      clientShouldBePaid = true;
      console.log(`âœ… [Shipment] Client AJOUTÃ‰ (vide â†’ "${newClientPhone}") â†’ PAIEMENT fidÃ©litÃ© autorisÃ©`);
    } else if (!clientWasEmpty && !clientIsNowFilled) {
      console.log(`âš ï¸ [Shipment] Client RETIRÃ‰ ("${oldClientPhone}" â†’ vide) â†’ PAS de paiement`);
    } else if (!clientWasEmpty && clientIsNowFilled && oldClientPhone !== newClientPhone) {
      console.log(`ðŸ”„ [Shipment] Client REMPLACÃ‰ ("${oldClientPhone}" â†’ "${newClientPhone}") â†’ PAS de paiement`);
    } else if (oldClientPhone === newClientPhone && newClientPhone !== '') {
      console.log(`â­ï¸ [Shipment] Client INCHANGÃ‰ ("${newClientPhone}") â†’ PAS de paiement`);
    }

    // ============================================================
    // ðŸ”¹ TRAITEMENT DU CLIENT (find ou create)
    //     CrÃ©ation auto si inexistant
    // ============================================================
    let clientUser: UserEntity | null = null;

    if (newClientPhone !== '') {
      try {
        const isValidPhone = /^\+?[0-9\s\-()]{7,20}$/.test(newClientPhone);

        if (!isValidPhone) {
          console.log(`âš ï¸ [Shipment] Format clientPhone invalide: ${newClientPhone} â†’ ignorÃ©`);
        } else {
          // âœ… Chercher dans user (peu importe le rÃ´le)
          clientUser = await this.userRepo.findOne({
            where: { phone: newClientPhone },
          });

          if (clientUser) {
            // âœ… User EXISTE â†’ rÃ©cupÃ©rer ses infos
            console.log(`â„¹ï¸ [Shipment] Client existant trouvÃ©: ${clientUser.id} (${clientUser.fullName})`);
            console.log(`   - Email: ${clientUser.email || 'N/A'}`);
            console.log(`   - Phone: ${clientUser.phone}`);
          } else {
            // âœ… User N'EXISTE PAS â†’ crÃ©er
            console.log(`âš ï¸ [Shipment] Aucun client avec ${newClientPhone} â†’ crÃ©ation user`);

            const defaultClientPassword = await bcrypt.hash(
              process.env.DEFAULT_CLIENT_PASSWORD || 'FavorHelp2024!',
              10,
            );

            const newClient = this.userRepo.create({
              fullName: dto.clientName || `Client ${newClientPhone.slice(-4)}`,
              phone: newClientPhone,
              password: defaultClientPassword,
              role: UserRole.CUSTOMER,
              isActive: true,
              provider: 'auto-created',
              country: shipment.user?.country || 'CD',
              city: shipment.user?.city || 'Goma',
            });

            console.log('ðŸ” [Shipment] Tentative crÃ©ation client avec:', {
              fullName: newClient.fullName,
              phone: newClient.phone,
              role: newClient.role,
              provider: newClient.provider,
              country: newClient.country,
              city: newClient.city,
            });

            clientUser = await this.userRepo.save(newClient);
            console.log(`âœ… [Shipment] Nouveau client crÃ©Ã©: ${clientUser.id} (${clientUser.fullName})`);
          }

          // âœ… RÃ©cupÃ©rer OU crÃ©er loyalty
          let clientLoyalty = await this.userLoyaltyRepo.findOne({
            where: { userId: clientUser.id, isActive: true },
          });

          if (!clientLoyalty) {
            clientLoyalty = await this.getOrCreateLoyaltyAccount(clientUser.id);
          }

          if (clientLoyalty?.loyaltyCode) {
            shipment.loyaltyCode = clientLoyalty.loyaltyCode;
            console.log(`âœ… [Shipment] loyaltyCode (client): ${clientLoyalty.loyaltyCode}`);
          }

          // âœ… Assigner le userId si pas dÃ©jÃ  dÃ©fini
          if (!shipment.userId) {
            shipment.userId = clientUser.id;
          }

          // âœ… Mettre Ã  jour clientName si vide
          if (!dto.clientName && clientUser.fullName) {
            shipment.clientName = clientUser.fullName;
          }
        }
      } catch (error: any) {
        console.error(`âŒ [Shipment] Erreur client:`, {
          message: error.message,
          code: error.code,
          detail: error.detail,
        });
      }
    }

    // ============================================================
    // ðŸ”¹ FALLBACK : si clientPhone vide mais userId existant
    // ============================================================
    if (!clientUser && (dto.userId || shipment.userId)) {
      try {
        const lookupId = dto.userId || shipment.userId;
        clientUser = await this.userRepo.findOne({ where: { id: lookupId } });

        if (clientUser) {
          console.log(`â„¹ï¸ [Shipment] Client trouvÃ© via userId: ${clientUser.id}`);

          let clientLoyalty = await this.userLoyaltyRepo.findOne({
            where: { userId: clientUser.id, isActive: true },
          });

          if (!clientLoyalty) {
            clientLoyalty = await this.getOrCreateLoyaltyAccount(clientUser.id);
          }

          if (clientLoyalty?.loyaltyCode && dto.loyaltyCode === undefined) {
            shipment.loyaltyCode = clientLoyalty.loyaltyCode;
          }
        }
      } catch (error: any) {
        console.error(`âŒ [Shipment] Erreur rÃ©cupÃ©ration client via userId:`, error.message);
      }
    }

    // ============================================================
    // ðŸ”¹ DÃ‰TECTION DU CHANGEMENT FOURNISSEUR
    //    âœ… Payer UNIQUEMENT si : ancien VIDE â†’ nouveau REMPLI
    //    âŒ Ne PAS payer si : remplacÃ© / retirÃ© / inchangÃ©
    // ============================================================
    let fournisseurShouldBePaid = false;

    const oldSupplierPhone = (previousState.fournisseurPhone || '').trim();
    const newSupplierPhone = (dto.supplierPhone || '').trim();

    const supplierWasEmpty = oldSupplierPhone === '';
    const supplierIsNowFilled = newSupplierPhone !== '';

    if (supplierWasEmpty && supplierIsNowFilled) {
      fournisseurShouldBePaid = true;
      console.log(`âœ… [Shipment] Fournisseur AJOUTÃ‰ (vide â†’ "${newSupplierPhone}") â†’ PAIEMENT fidÃ©litÃ© autorisÃ©`);
    } else if (!supplierWasEmpty && !supplierIsNowFilled) {
      console.log(`âš ï¸ [Shipment] Fournisseur RETIRÃ‰ ("${oldSupplierPhone}" â†’ vide) â†’ PAS de paiement`);
    } else if (!supplierWasEmpty && supplierIsNowFilled && oldSupplierPhone !== newSupplierPhone) {
      console.log(`ðŸ”„ [Shipment] Fournisseur REMPLACÃ‰ ("${oldSupplierPhone}" â†’ "${newSupplierPhone}") â†’ PAS de paiement`);
    } else if (oldSupplierPhone === newSupplierPhone && newSupplierPhone !== '') {
      console.log(`â­ï¸ [Shipment] Fournisseur INCHANGÃ‰ ("${newSupplierPhone}") â†’ PAS de paiement`);
    }

    // ============================================================
    // ðŸ”¹ TRAITEMENT DU FOURNISSEUR (find ou create)
    //     CrÃ©ation auto si inexistant
    //     âœ… INDÃ‰PENDANT DU CLIENT
    // ============================================================
    let fournisseurUser: UserEntity | null = null;

    if (newSupplierPhone !== '') {
      try {
        const isValidPhone = /^\+?[0-9\s\-()]{7,20}$/.test(newSupplierPhone);

        if (!isValidPhone) {
          console.log(`âš ï¸ [Shipment] Format supplierPhone invalide: ${newSupplierPhone} â†’ ignorÃ©`);
          shipment.fournisseurPhone = newSupplierPhone;
        } else {
          // âœ… Cas particulier : mÃªme personne que le client
          const isSameAsClient = clientUser?.phone === newSupplierPhone;

          if (isSameAsClient && clientUser) {
            console.log(`âš ï¸ [Shipment] supplierPhone === clientPhone â†’ mÃªme personne`);

            fournisseurUser = clientUser;
          } else {
            // âœ… Chercher dans user (peu importe le rÃ´le)
            fournisseurUser = await this.userRepo.findOne({
              where: { phone: newSupplierPhone },
            });

            if (fournisseurUser) {
              // âœ… User EXISTE â†’ rÃ©cupÃ©rer ses infos
              console.log(`â„¹ï¸ [Shipment] Fournisseur existant trouvÃ©: ${fournisseurUser.id} (${fournisseurUser.fullName})`);
              console.log(`   - Email: ${fournisseurUser.email || 'N/A'}`);
              console.log(`   - Phone: ${fournisseurUser.phone}`);
            } else {
              // âœ… User N'EXISTE PAS â†’ crÃ©er
              console.log(`âš ï¸ [Shipment] Aucun fournisseur avec ${newSupplierPhone} â†’ crÃ©ation user`);

              const finalFournisseurName =
                dto.supplierName && dto.supplierName.trim() !== ''
                  ? dto.supplierName.trim()
                  : `Fournisseur ${newSupplierPhone.slice(-4)}`;

              const defaultPassword = await bcrypt.hash(
                process.env.DEFAULT_SUPPLIER_PASSWORD || 'FavorHelp2024!',
                10,
              );

              const newFournisseur = this.userRepo.create({
                fullName: finalFournisseurName,
                phone: newSupplierPhone,
                password: defaultPassword,
                role: UserRole.CUSTOMER,
                isActive: true,
                provider: 'auto-created',
                country: shipment.user?.country || 'CD',
                city: shipment.user?.city || 'Goma',
              });

              console.log('ðŸ” [Shipment] Tentative crÃ©ation fournisseur avec:', {
                fullName: newFournisseur.fullName,
                phone: newFournisseur.phone,
                role: newFournisseur.role,
                provider: newFournisseur.provider,
                country: newFournisseur.country,
                city: newFournisseur.city,
              });

              fournisseurUser = await this.userRepo.save(newFournisseur);
              console.log(`âœ… [Shipment] Nouveau fournisseur crÃ©Ã©: ${fournisseurUser.id} (${fournisseurUser.fullName})`);
            }
          }

          // âœ… Assigner les infos du fournisseur
          shipment.fournisseurId = fournisseurUser.id;
          shipment.fournisseurName = fournisseurUser.fullName;
          shipment.fournisseurPhone = newSupplierPhone;

          // âœ… RÃ©cupÃ©rer OU crÃ©er loyalty
          let fournisseurLoyalty = await this.userLoyaltyRepo.findOne({
            where: { userId: fournisseurUser.id, isActive: true },
          });

          if (!fournisseurLoyalty) {
            fournisseurLoyalty = await this.getOrCreateLoyaltyAccount(fournisseurUser.id);
          }

          if (fournisseurLoyalty?.loyaltyCode && dto.loyaltyCodeFournisseur === undefined) {
            shipment.loyaltyCodeFournisseur = fournisseurLoyalty.loyaltyCode;
            console.log(`âœ… [Shipment] loyaltyCodeFournisseur: ${fournisseurLoyalty.loyaltyCode}`);
          }
        }
      } catch (error: any) {
        console.error(`âŒ [Shipment] Erreur fournisseur:`, {
          message: error.message,
          code: error.code,
          detail: error.detail,
        });
        shipment.fournisseurPhone = newSupplierPhone;
      }
    } else {
      // ðŸ”¹ Fallback : si supplierName/Phone envoyÃ©s directement (ancien comportement)
      if (dto.supplierName !== undefined) {
        shipment.fournisseurName = dto.supplierName;
      }
      if (dto.supplierPhone !== undefined) {
        shipment.fournisseurPhone = dto.supplierPhone;
      }
    }

    // ============================================================
    // ðŸ”¹ COMPANIES
    // ============================================================
    if (dto.pickupCompanyId !== undefined) shipment.pickupCompanyId = dto.pickupCompanyId;
    if (dto.shippingCompanyId !== undefined) shipment.shippingCompanyId = dto.shippingCompanyId;
    if (dto.deliveryCompanyId !== undefined) shipment.deliveryCompanyId = dto.deliveryCompanyId;

    // ============================================================
    // ðŸ”¹ STATUS & FLAGS
    // ============================================================
    if (dto.status !== undefined) shipment.status = dto.status;
    if (dto.pickupEnabled !== undefined) shipment.pickupEnabled = dto.pickupEnabled;
    if (dto.shippingEnabled !== undefined) shipment.shippingEnabled = dto.shippingEnabled;
    if (dto.deliveryEnabled !== undefined) shipment.deliveryEnabled = dto.deliveryEnabled;

    // ============================================================
    // ðŸ”¹ isPaid / paid
    // âœ… CORRECTION ROBUSTE : normalisation explicite en boolÃ©en
    //    (ne dÃ©pend pas de la config du ValidationPipe)
    //    Accepte : true/false, 'true'/'false', 1/0, '1'/'0'
    // ============================================================
    const rawPaidValue = dto.isPaid ?? dto.paid;

    if (rawPaidValue !== undefined) {
      const normalizeBoolean = (v: any): boolean => {
        if (v === true || v === 'true' || v === '1' || v === 1) return true;
        if (v === false || v === 'false' || v === '0' || v === 0) return false;
        throw new BadRequestException(
          `Valeur invalide pour isPaid/paid: ${JSON.stringify(v)}. Attendu: true/false/1/0.`,
        );
      };

      const paidValue: boolean = normalizeBoolean(rawPaidValue);

      shipment.isPaid = paidValue;
      shipment.paid = paidValue;
      console.log(`ðŸ’° [Shipment] isPaid/paid mis Ã  jour â†’ ${paidValue} (boolÃ©en ${typeof paidValue})`);
    }

    // ============================================================
    // ðŸ”¹ LOYALTY CODES (override manuel)
    // ============================================================
    if (dto.loyaltyCode !== undefined) {
      shipment.loyaltyCode = dto.loyaltyCode ?? undefined;
    }
    if (dto.loyaltyCodeFournisseur !== undefined) {
      shipment.loyaltyCodeFournisseur = dto.loyaltyCodeFournisseur ?? undefined;
    }

    // ============================================================
    // ðŸ”¹ PICKUP
    // ============================================================
    if (shipment.pickupEnabled) {
      if (dto.pickupFrom) shipment.pickupFrom = dto.pickupFrom;
      if (dto.pickupTo) shipment.pickupTo = dto.pickupTo;
      if (dto.pickupContactName) shipment.pickupContactName = dto.pickupContactName;
      if (dto.pickupContactPhone) shipment.pickupContactPhone = dto.pickupContactPhone;
      if (dto.pickupTransportTypeId) {
        const transport = await this.transportRepo.findOne({
          where: { id: dto.pickupTransportTypeId },
        });
        if (!transport) {
          throw new NotFoundException(
            await this.i18n.translate('shipment.error.transport_not_found', lang, { id: dto.pickupTransportTypeId }),
          );
        }
        shipment.pickupTransportType = transport;
      }
    }

    // ============================================================
    // ðŸ”¹ SHIPPING
    // ============================================================
    if (shipment.shippingEnabled) {
      if (dto.shippingFrom) shipment.shippingFrom = dto.shippingFrom;
      if (dto.shippingTo) shipment.shippingTo = dto.shippingTo;
    }

    // ============================================================
    // ðŸ”¹ DELIVERY
    // ============================================================
    if (shipment.deliveryEnabled && dto.deliveryAddressId) {
      shipment.deliveryAddressId = dto.deliveryAddressId;
    }

    // ============================================================
    // ðŸ”¹ PACKAGE
    // ============================================================
    if (shipment.package) {
      Object.assign(shipment.package, {
        description: dto.description ?? shipment.package.description,
        external_quantity: dto.external_quantity ?? shipment.package.external_quantity,
        weight: dto.weight ?? shipment.package.weight,
        length: dto.length ?? shipment.package.length,
        dimensions: dto.dimensions ?? shipment.package.dimensions,
        internal_quantity: dto.internal_quantity ?? shipment.package.internal_quantity,
        value: dto.value ?? shipment.package.value,
        fragile: dto.fragile ?? shipment.package.fragile,
      });
      await this.packageRepo.save(shipment.package);
    }

    // ============================================================
    // ðŸ”¹ IMAGE
    // ============================================================
    if (file) {
      if (shipment.image) {
        try {
          const oldFilename = shipment.image.split('/').pop()!;
          await this.filesService.deleteFile('shipment', oldFilename);
        } catch (err) {
          console.warn('Impossible de supprimer lâ€™ancienne image:', err);
        }
      }
      const uploadedFile = await this.filesService.uploadFile(file, 'shipment', 'product');
      shipment.image = uploadedFile.data;
    }

    // ============================================================
    // ðŸ”¹ PRICES
    // ============================================================
    if (dto.pickupPrice !== undefined) shipment.pickupPrice = dto.pickupPrice;
    if (dto.shippingPrice !== undefined) shipment.shippingPrice = dto.shippingPrice;
    if (dto.deliveryPrice !== undefined) shipment.deliveryPrice = dto.deliveryPrice;
    shipment.totalPrice = dto.totalPrice ?? (shipment.pickupPrice ?? 0) + (shipment.shippingPrice ?? 0) + (shipment.deliveryPrice ?? 0);

    // ============================================================
    // ðŸ”¹ WHATSAPP
    // ============================================================
    if (dto.whatsapp_number !== undefined) {
      shipment.whatsapp_number = dto.whatsapp_number;
    }

    // ============================================================
    // ðŸ”¹ PAYMENT METHOD
    // ============================================================
    if (dto.paymentMethod !== undefined) {
      shipment.paymentMethod = dto.paymentMethod;
    }

    await this.shipmentRepo.save(shipment);

    // ============================================================
    // ðŸ’° PAIEMENT FIDÃ‰LITÃ‰
    // âœ… RÃˆGLE STRICTE :
    //   - Payer UNIQUEMENT si un client/fournisseur a Ã©tÃ© AJOUTÃ‰
    //     (Ã©tait vide â†’ devient rempli)
    //   - Ne PAS payer si :
    //     Â· Remplacement (A â†’ B)
    //     Â· Retrait (A â†’ vide)
    //     Â· InchangÃ© (A â†’ A)
    // ============================================================
    const shouldPayClient = clientShouldBePaid;
    const shouldPayFournisseur = fournisseurShouldBePaid;

    console.log(`ðŸ’° [Fidelity] Analyse finale:`, {
      shouldPayClient,
      shouldPayFournisseur,
      shipmentLoyaltyCode: shipment.loyaltyCode,
      shipmentLoyaltyCodeFournisseur: shipment.loyaltyCodeFournisseur,
    });

    if (!shouldPayClient && !shouldPayFournisseur) {
      console.log(`â­ï¸ [Fidelity] Aucun nouveau client/fournisseur ajoutÃ© â†’ AUCUN paiement fidÃ©litÃ©`);
    } else {
      console.log(`ðŸ’° [Fidelity] Paiement dÃ©clenchÃ©:`, {
        shouldPayClient,
        shouldPayFournisseur,
      });

      try {
        const amountForLoyalty = shipment.totalPrice || 0;

        if (amountForLoyalty > 0) {
          // âœ… GÃ©nÃ©rer pin et collectedAt
          shipment.pin = GeneratePin.generate();
          shipment.collectedAt = new Date();
          await this.shipmentRepo.save(shipment);

          // âœ… RÃ©cupÃ©rer le % de frais fidÃ©litÃ© via company settings
          let loyaltyFeePercentage = 0;
          let mainCompany: CompanyEntity | null = shipment.shippingCompanyId
            ? await this.companyRepo.findOne({ where: { id: shipment.shippingCompanyId } })
            : null;

          if (!mainCompany && shipment.pickupCompanyId) {
            mainCompany = await this.companyRepo.findOne({ where: { id: shipment.pickupCompanyId } });
          }
          if (!mainCompany && shipment.deliveryCompanyId) {
            mainCompany = await this.companyRepo.findOne({ where: { id: shipment.deliveryCompanyId } });
          }

          if (mainCompany) {
            const companySettings = await this.companySettingsRepo.findOne({
              where: { companyId: mainCompany.id },
            });

            loyaltyFeePercentage = companySettings?.loyaltyFeeFixed || 5.00;
            console.log(`[Fidelity] ðŸ” Pourcentage: ${loyaltyFeePercentage}%`);
          } else {
            loyaltyFeePercentage = 5.00;
            console.log(`[Fidelity] âš ï¸ Aucune company â†’ 5% par dÃ©faut`);
          }

          const totalFees = (amountForLoyalty * loyaltyFeePercentage) / 100;
          const loyaltyFeeClient = totalFees / 2;
          const loyaltyFeeFournisseur = totalFees / 2;

          console.log(`[Fidelity] ðŸ’° RÃ©partition:`, {
            totalFees,
            loyaltyFeeClient,
            loyaltyFeeFournisseur,
          });

          // ============================================================
          // âœ… Payer le CLIENT UNIQUEMENT si ajoutÃ© (vide â†’ rempli)
          // ============================================================
          if (shouldPayClient && shipment.loyaltyCode && loyaltyFeeClient > 0) {
            const userLoyalty = await this.userLoyaltyRepo.findOne({
              where: { loyaltyCode: shipment.loyaltyCode, isActive: true },
              relations: ['user'],
            });

            if (userLoyalty?.user?.userIdFpay) {
              try {
                const fpayResponse = await this.fpayService.makeSend(
                  {
                    userId: userLoyalty.user.userIdFpay,
                    amount: loyaltyFeeClient,
                    description: `Frais de fidÃ©litÃ© (50%) pour le colis ${shipment.trackingNumber}`,
                    currency: 'USD',
                    countryCode: 'CD',
                  },
                  currentUser
                );

                if (fpayResponse?.data?.transaction?.status === 'SUCCESS') {
                  const loyaltyHistory = this.loyaltyHistoryRepo.create({
                    userId: userLoyalty.user.id,
                    loyaltyId: userLoyalty.id,
                    transactionType: LoyaltyTransactionType.EARN,
                    sourceType: LoyaltySourceType.SHIPMENT,
                    sourceId: shipment.id,
                    description: `Frais de fidÃ©litÃ© (50%) pour l'expÃ©dition ${shipment.trackingNumber}`,
                  });
                  await this.loyaltyHistoryRepo.save(loyaltyHistory);

                  userLoyalty.pointsBalance += Math.round(loyaltyFeeClient * 100);
                  userLoyalty.pointsTotalEarned += Math.round(loyaltyFeeClient * 100);
                  await this.userLoyaltyRepo.save(userLoyalty);

                  console.log(`[Fidelity] âœ… ${loyaltyFeeClient} USD envoyÃ© au CLIENT`);
                }
              } catch (err: any) {
                console.error(`[Fidelity] âŒ Erreur paiement client:`, err.message);
              }
            }
          }

          // ============================================================
          // âœ… Payer le FOURNISSEUR UNIQUEMENT si ajoutÃ© (vide â†’ rempli)
          // ============================================================
          if (shouldPayFournisseur && shipment.loyaltyCodeFournisseur && loyaltyFeeFournisseur > 0) {
            const fournisseurLoyalty = await this.userLoyaltyRepo.findOne({
              where: { loyaltyCode: shipment.loyaltyCodeFournisseur, isActive: true },
              relations: ['user'],
            });

            if (fournisseurLoyalty?.user?.userIdFpay) {
              try {
                const fpayResponse = await this.fpayService.makeSend(
                  {
                    userId: fournisseurLoyalty.user.userIdFpay,
                    amount: loyaltyFeeFournisseur,
                    description: `Frais de fidÃ©litÃ© (50%) fournisseur pour le colis ${shipment.trackingNumber}`,
                    currency: 'USD',
                    countryCode: 'CD',
                  },
                  currentUser,
                );

                if (fpayResponse?.data?.transaction?.status === 'SUCCESS') {
                  const loyaltyHistory = this.loyaltyHistoryRepo.create({
                    userId: fournisseurLoyalty.user.id,
                    loyaltyId: fournisseurLoyalty.id,
                    transactionType: LoyaltyTransactionType.EARN,
                    sourceType: LoyaltySourceType.SHIPMENT,
                    sourceId: shipment.id,
                    description: `Frais de fidÃ©litÃ© (50%) fournisseur pour l'expÃ©dition ${shipment.trackingNumber}`,
                  });
                  await this.loyaltyHistoryRepo.save(loyaltyHistory);

                  fournisseurLoyalty.pointsBalance += Math.round(loyaltyFeeFournisseur * 100);
                  fournisseurLoyalty.pointsTotalEarned += Math.round(loyaltyFeeFournisseur * 100);
                  await this.userLoyaltyRepo.save(fournisseurLoyalty);

                  console.log(`[Fidelity] âœ… ${loyaltyFeeFournisseur} USD envoyÃ© au FOURNISSEUR`);
                }
              } catch (err: any) {
                console.error(`[Fidelity] âŒ Erreur paiement fournisseur:`, err.message);
              }
            }
          }

          // âœ… Enregistrer l'opÃ©ration
          await this.operation.save({
            debit: amountForLoyalty,
            credit: 0,
            shipmentId: shipment.id,
            designation: await this.i18n.translate('shipment.operation.admin_payment_designation', lang, {
              trackingNumber: shipment.trackingNumber,
            }),
            status: OperationStatus.ACCEPTED,
            userId: currentUser.id,
            paymentMethod: PaymentMethod.CASH,
            provider: 'ADMIN_AUTO_PAID',
            reference: this.generateOperationReference(),
          });

          console.log(`[Fidelity] âœ… Paiement fidÃ©litÃ© complet pour ${shipment.trackingNumber}`);
        } else {
          console.log(`âš ï¸ [Fidelity] Montant total = 0 â†’ pas de paiement`);
        }
      } catch (err: any) {
        console.error(`âŒ [Fidelity] Erreur globale paiement fidÃ©litÃ©:`, err.message);
      }
    }

    // ============================================================
    // ðŸ”¹ RECHARGER LE SHIPMENT
    // ============================================================
    const updatedShipment = await this.shipmentRepo.findOne({
      where: { id },
      relations: [
        'package',
        'pickupTransportType',
        'user',
        'fournisseur',
        'trackings',
        'ltaShipments',
        'pickupCompany',
        'shippingCompany',
        'deliveryCompany',
      ],
    });
    if (!updatedShipment) {
      throw new NotFoundException(await this.i18n.translate('shipment.error.update_reload_failed', lang));
    }

    return {
      message: await this.i18n.translate('shipment.update_admin_success', lang),
      data: updatedShipment,
    };
  }

  async updateShipmentPrices(
    shipmentId: string,
    priceDto: ShipmentPriceDto,
    lang: string = 'fr',
  ): Promise<{ message: string; data: Shipment }> {
    const shipment = await this.shipmentRepo.findOne({
      where: { id: shipmentId },
      relations: ['user', 'deliveryAddress', 'package', 'ltaShipments'],
    });
    if (!shipment) {
      throw new NotFoundException(await this.i18n.translate('shipment.error.not_found', lang, { id: shipmentId }));
    }

    const wantsToUpdatePrice =
      priceDto.pickupPrice !== undefined ||
      priceDto.shippingPrice !== undefined ||
      priceDto.deliveryPrice !== undefined;
    const enabledCount =
      Number(shipment.pickupEnabled) +
      Number(shipment.shippingEnabled) +
      Number(shipment.deliveryEnabled);
    const canUpdatePrice = enabledCount > 0;
    if (wantsToUpdatePrice && !canUpdatePrice) {
      throw new BadRequestException(
        await this.i18n.translate('shipment.error.cannot_update_price_no_service', lang),
      );
    }

    if (priceDto.pickupPrice !== undefined) shipment.pickupPrice = priceDto.pickupPrice;
    if (priceDto.shippingPrice !== undefined) shipment.shippingPrice = priceDto.shippingPrice;
    if (priceDto.deliveryPrice !== undefined) shipment.deliveryPrice = priceDto.deliveryPrice;

    shipment.totalPrice = (shipment.pickupPrice ?? 0) + (shipment.shippingPrice ?? 0) + (shipment.deliveryPrice ?? 0);

    if (shipment.shippingEnabled) {
      shipment.pin = GeneratePin.generate();
      if (shipment.user?.email) {
        const shipmentEmailData = {
          user: shipment.user,
          order: {
            ...shipment,
            currency: 'USD',
            addressUser: { address: shipment.deliveryAddress?.address || 'Non spÃ©cifiÃ©e' },
            invoiceNumber: shipment.trackingNumber,
            paymentStatus: shipment.paymentMethod || 'paid',
            pin: shipment.pin,
          },
          clientName: shipment.user?.fullName || 'Client',
          pinCode: shipment.pin,
          trackingNumber: shipment.trackingNumber,
          shipmentReference: shipment.trackingNumber,
          weight: shipment.package?.weight ? `${shipment.package.weight} kg` : 'Non spÃ©cifiÃ©',
          dimensions: shipment.package?.dimensions || 'Non spÃ©cifiÃ©es',
          packageType: shipment.package?.description || 'Colis standard',
          totalPrice: shipment.totalPrice ? `${shipment.totalPrice} $` : '0 $',
          year: new Date().getFullYear(),
        };
        await this.mailServic.sendShipmentPinEmail(shipment.user.email, shipmentEmailData);
      }
    }

    if (priceDto.status !== undefined) {
      shipment.status = priceDto.status;
    } else if (
      shipment.pickupEnabled &&
      shipment.shippingEnabled &&
      shipment.pickupPrice !== undefined &&
      shipment.shippingPrice === undefined
    ) {
      shipment.status = ShipmentStatus.PENDING;
    } else if (
      priceDto.pickupPrice !== undefined &&
      (shipment.status === ShipmentStatus.PICKUP_ASSIGNED ||
        shipment.status === ShipmentStatus.PICKUP_IN_PROGRESS)
    ) {
      // no change
    } else if (priceDto.pickupPrice !== undefined && shipment.status === ShipmentStatus.PICKUP_COMPLETED) {
      shipment.status = ShipmentStatus.AT_ORIGIN_AGENCY;
    } else if (priceDto.shippingPrice !== undefined) {
      shipment.status = ShipmentStatus.AWAITING_SHIPPING;
    }

    const savedShipment = await this.shipmentRepo.save(shipment);
    return {
      message: await this.i18n.translate('shipment.price_update_success', lang),
      data: savedShipment,
    };
  }

  async findAll(
    currentUser: UserEntity,
    page: number = 1,
    limit: number = 10,
    search?: string,
    type?: string,
    status?: string,
    lang: string = 'fr',
  ): Promise<any> {
    const skip = (page - 1) * limit;
    const activeCompanyId = currentUser.activeCompanyId;
    if (!activeCompanyId) {
      throw new BadRequestException(
        await this.i18n.translate('shipment.error.no_active_company', lang),
      );
    }

    const queryBuilder = this.shipmentRepo
      .createQueryBuilder('shipment')
      .leftJoinAndSelect('shipment.package', 'package')
      .leftJoinAndSelect('shipment.pickupTransportType', 'pickupTransportType')
      .leftJoinAndSelect('shipment.user', 'user')
      .leftJoinAndSelect('shipment.fournisseur', 'fournisseur')
      .leftJoinAndSelect('shipment.trackings', 'trackings')
      .leftJoinAndSelect('shipment.ltaShipments', 'ltaShipments')
      .leftJoinAndSelect('ltaShipments.lta', 'lta')
      .leftJoinAndSelect('lta.tracking', 'ltaTracking')
      .leftJoinAndSelect('shipment.deliveryAddress', 'deliveryAddress')
      .leftJoinAndSelect('shipment.pickupCompany', 'pickupCompany')
      .leftJoinAndSelect('pickupCompany.invoiceConfiguration', 'pickupInvoiceConfig')        // âœ… AJOUT
      .leftJoinAndSelect('shipment.shippingCompany', 'shippingCompany')
      .leftJoinAndSelect('shippingCompany.invoiceConfiguration', 'shippingInvoiceConfig')    // âœ… AJOUT
      .leftJoinAndSelect('shipment.deliveryCompany', 'deliveryCompany')
      .leftJoinAndSelect('deliveryCompany.invoiceConfiguration', 'deliveryInvoiceConfig');  // âœ… AJOUT

    queryBuilder.andWhere(
      '(shipment.pickupCompanyId = :companyId OR shipment.shippingCompanyId = :companyId OR shipment.deliveryCompanyId = :companyId)',
      { companyId: activeCompanyId },
    );

    if (type && type.trim() !== '') {
      switch (type.toLowerCase()) {
        case 'pickup':
          queryBuilder.andWhere('shipment.pickupEnabled = :pickupEnabled', { pickupEnabled: true });
          break;
        case 'shipping':
          queryBuilder.andWhere('shipment.shippingEnabled = :shippingEnabled', { shippingEnabled: true });
          break;
        case 'delivery':
          queryBuilder.andWhere('shipment.deliveryEnabled = :deliveryEnabled', { deliveryEnabled: true });
          break;
      }
    }
    if (status && status.trim() !== '') {
      switch (status.toUpperCase()) {
        case 'PENDING':
          queryBuilder.andWhere('shipment.status = :pendingStatus', { pendingStatus: ShipmentStatus.PENDING });
          break;
        case 'SHIPPING':
          queryBuilder.andWhere('shipment.status = :shippingStatus', { shippingStatus: ShipmentStatus.SHIPPING_IN_PROGRESS });
          break;
        case 'ARRIVED':
          queryBuilder.andWhere('shipment.status = :arrivedStatus', { arrivedStatus: ShipmentStatus.ARRIVED_DESTINATION });
          break;
      }
    }
    if (search && search.trim() !== '') {
      queryBuilder.andWhere(
        `(shipment.trackingNumber LIKE :search OR
    shipment.clientName LIKE :search OR
    shipment.clientPhone LIKE :search OR
    shipment.pin LIKE :search OR
    shipment.fournisseurName LIKE :search OR
    shipment.fournisseurPhone LIKE :search OR
    shipment.loyaltyCode LIKE :search OR
    shipment.loyaltyCodeFournisseur LIKE :search OR
    lta.ltaNumber LIKE :search OR
    lta.externalLtaNumber LIKE :search OR
    user.fullName LIKE :search OR
    user.email LIKE :search OR
    user.phone LIKE :search OR
    fournisseur.fullName LIKE :search OR
    fournisseur.phone LIKE :search OR
    fournisseur.email LIKE :search OR
    pickupCompany.companyName LIKE :search OR
    shippingCompany.companyName LIKE :search OR
    deliveryCompany.companyName LIKE :search)`,
        { search: `%${search}%` },
      );
    }

    const total = await queryBuilder.getCount();
    const shipments = await queryBuilder
      .orderBy('shipment.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getMany();

    let filterMessage = '';
    if (type) filterMessage += ` type: ${type}`;
    if (status) filterMessage += ` statut: ${status}`;
    if (search) filterMessage += ` recherche: "${search}"`;

    const message = search || type || status
      ? await this.i18n.translate('shipment.list_filtered', lang, { count: shipments.length, filter: filterMessage })
      : shipments.length > 0
        ? await this.i18n.translate('shipment.list_success', lang, { count: shipments.length })
        : await this.i18n.translate('shipment.list_empty', lang);

    return {
      message,
      data: {
        data: shipments,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
  async findAllWithoutLta(currentUser: UserEntity, ltaId?: string, lang: string = 'fr'): Promise<Shipment[]> {
    const ALLOWED_STATUSES = [
      'AT_ORIGIN_AGENCY',
      'AWAITING_SHIPPING',
      'SHIPPING_IN_PROGRESS',
      'ARRIVED_DESTINATION',
      'READY_FOR_DELIVERY',
      'DELIVERED',
      'TRANSIT',
      'COLLECTED',
    ];
    const activeCompanyId = currentUser.activeCompanyId;
    if (!activeCompanyId) {
      throw new BadRequestException(
        await this.i18n.translate('shipment.error.no_active_company', lang),
      );
    }
    const qb = this.shipmentRepo
      .createQueryBuilder('shipment')
      .distinct(true)
      .leftJoinAndSelect('shipment.package', 'package')
      .leftJoinAndSelect('shipment.pickupTransportType', 'pickupTransportType')
      .leftJoinAndSelect('shipment.user', 'user')
      .leftJoinAndSelect('shipment.trackings', 'trackings')
      .leftJoinAndSelect('shipment.deliveryAddress', 'deliveryAddress')
      .leftJoinAndSelect('shipment.pickupCompany', 'pickupCompany')
      .leftJoinAndSelect('shipment.shippingCompany', 'shippingCompany')
      .leftJoinAndSelect('shipment.deliveryCompany', 'deliveryCompany')
      .leftJoin('shipment.ltaShipments', 'ltaShipments')
      .where('shipment.shippingEnabled = :enabled', { enabled: true })
      .andWhere('shipment.status IN (:...statuses)', { statuses: ALLOWED_STATUSES })
      .andWhere(
        '(shipment.pickupCompanyId = :companyId OR shipment.shippingCompanyId = :companyId OR shipment.deliveryCompanyId = :companyId)',
        { companyId: activeCompanyId },
      );
    if (ltaId) {
      qb.andWhere('(ltaShipments.id IS NULL OR ltaShipments.ltaId = :ltaId)', { ltaId });
    } else {
      qb.andWhere('ltaShipments.id IS NULL');
    }
    return qb.orderBy('shipment.createdAt', 'DESC').getMany();
  }

  async findAllByUser(userId: string, lang: string = 'fr'): Promise<Shipment[]> {
    return this.shipmentRepo.find({
      where: { userId },
      relations: [
        'package',
        'pickupTransportType',
        'user',
        'trackings',
        'ltaShipments',
        'ltaShipments.lta',
        'deliveryAddress',
        'pickupCompany',
        'pickupCompany.invoiceConfiguration',      // âœ… AJOUT
        'shippingCompany',
        'shippingCompany.invoiceConfiguration',    // âœ… AJOUT
        'deliveryCompany',
        'deliveryCompany.invoiceConfiguration',    // âœ… AJOUT
      ],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, lang: string = 'fr'): Promise<Shipment> {
    const shipment = await this.shipmentRepo.findOne({
      where: { id },
      relations: [
        'package',
        'pickupTransportType',
        'user',
        'fournisseur',
        'trackings',
        'ltaShipments',
        'ltaShipments.lta',
        'deliveryAddress',
        'pickupCompany',
        'pickupCompany.invoiceConfiguration',      // âœ… AJOUT
        'shippingCompany',
        'shippingCompany.invoiceConfiguration',    // âœ… AJOUT
        'deliveryCompany',
        'deliveryCompany.invoiceConfiguration',    // âœ… AJOUT
      ],
    });
    if (!shipment) throw new NotFoundException(await this.i18n.translate('shipment.error.not_found', lang, { id }));
    return shipment;
  }
  async update(
    id: string,
    updateShipmentDto: UpdateShipmentDto,
    currentUser: UserEntity,
    lang: string = 'fr',
  ): Promise<Shipment> {
    const shipment = await this.shipmentRepo.findOne({
      where: { id },
      relations: [
        'package',
        'pickupTransportType',
        'user',
        'trackings',
        'ltaShipments',
        'ltaShipments.lta',
        'deliveryAddress',
        'pickupCompany',
        'shippingCompany',
        'deliveryCompany',
      ],
    });
    if (!shipment) {
      throw new NotFoundException(await this.i18n.translate('shipment.error.not_found', lang, { id }));
    }
    if (shipment.userId !== currentUser.id) {
      throw new ForbiddenException(await this.i18n.translate('shipment.error.update_forbidden', lang));
    }

    const { pickupTransportTypeId, ...packageData } = updateShipmentDto;

    shipment.pickupEnabled = updateShipmentDto.pickupEnabled ?? shipment.pickupEnabled;
    shipment.shippingEnabled = updateShipmentDto.shippingEnabled ?? shipment.shippingEnabled;
    shipment.deliveryEnabled = updateShipmentDto.deliveryEnabled ?? shipment.deliveryEnabled;

    if (updateShipmentDto.pickupCompanyId !== undefined) shipment.pickupCompanyId = updateShipmentDto.pickupCompanyId;
    if (updateShipmentDto.shippingCompanyId !== undefined) shipment.shippingCompanyId = updateShipmentDto.shippingCompanyId;
    if (updateShipmentDto.deliveryCompanyId !== undefined) shipment.deliveryCompanyId = updateShipmentDto.deliveryCompanyId;

    if (pickupTransportTypeId) {
      const pickupTransport = await this.transportRepo.findOne({ where: { id: pickupTransportTypeId } });
      if (!pickupTransport) throw new NotFoundException(await this.i18n.translate('shipment.error.transport_not_found', lang, { id: pickupTransportTypeId }));
      shipment.pickupTransportType = pickupTransport;
    }

    Object.assign(shipment, updateShipmentDto);
    if (shipment.package) {
      Object.assign(shipment.package, packageData);
      await this.packageRepo.save(shipment.package);
    }
    await this.shipmentRepo.save(shipment);

    const updatedShipment = await this.shipmentRepo.findOne({
      where: { id },
      relations: [
        'package',
        'pickupTransportType',
        'user',
        'trackings',
        'ltaShipments',
        'ltaShipments.lta',
        'deliveryAddress',
        'pickupCompany',
        'shippingCompany',
        'deliveryCompany',
      ],
    });
    if (!updatedShipment) {
      throw new NotFoundException(await this.i18n.translate('shipment.error.update_reload_failed', lang));
    }
    return updatedShipment;
  }

  async remove(id: string, lang: string = 'fr'): Promise<{ message: string }> {
    const shipment = await this.findOne(id, lang);
    await this.shipmentRepo.remove(shipment);
    return { message: await this.i18n.translate('shipment.delete_success', lang) };
  }

  async collectShipment(
    shipmentId: string,
    user: UserEntity,
    body: CollectShipmentBodyDto,
    lang: string = 'fr',
  ): Promise<CollectShipmentResponseDto> {
    const {
      deliveryFrom,
      deliveryTo,
      deliveryAddressId,
      deliveryPrice,
      totalAmount,
      currency,
      provider,
      phone,
      amount,
      paymentMethod,
      pin,
    } = body;

    const shipment = await this.shipmentRepo.findOne({
      where: { id: shipmentId },
      relations: ['shippingCompany', 'pickupCompany', 'deliveryCompany', 'user'],
    });
    if (!shipment) throw new NotFoundException(await this.i18n.translate('shipment.error.not_found', lang, { id: shipmentId }));
    if (shipment.paid) {
      throw new BadRequestException(await this.i18n.translate('shipment.error.already_paid', lang));
    }

    const user_active = await this.userRepo.findOne({ where: { id: user.id } });
    if (!user_active) {
      throw new BadRequestException(await this.i18n.translate('shipment.error.user_not_recognized', lang));
    }

    let selectedMethod: PaymentMethod = PaymentMethod.MOBILE_MONEY;
    let fpayTransactionId: string | null = null;
    let fpayReference: string | null = null;

    // âœ… AJOUT FPAY - SHIPMENT
    if (paymentMethod === PaymentMethod.FPAY) {
      selectedMethod = PaymentMethod.FPAY;

      const amountToPay = totalAmount || 0;

      const fpayData = {
        amount: amountToPay,
        currency: currency || 'USD',
        description: `Paiement du colis ${shipment.trackingNumber}`,
        access_token: body.access_token as string,
      };

      console.log('[Shipment] Tentative de paiement FPAY :', {
        userId: user.id,
        amount: fpayData.amount,
        currency: fpayData.currency,
        trackingNumber: shipment.trackingNumber,
        hasAccessToken: !!fpayData.access_token,
      });

      const fpayResponse = await this.fpayService.makePayment(fpayData, user);

      if (fpayResponse?.data?.transaction?.status === 'SUCCESS') {
        fpayTransactionId = fpayResponse.data.transaction.id;
        fpayReference = fpayResponse.data.transaction.reference;

        console.log('[Shipment] âœ… Paiement FPAY rÃ©ussi:', {
          transactionId: fpayTransactionId,
          reference: fpayReference,
          amount: fpayResponse.data.transaction.amount,
        });
      }
    }
    // âœ… PAIEMENT MOBILE_MONEY (Pawapay)
    else {
      selectedMethod = PaymentMethod.MOBILE_MONEY;

      if (!provider || !phone) {
        throw new BadRequestException(
          await this.i18n.translate('shipment.error.pawapay_required', lang)
        );
      }

      const phon = phone.trim();
      if (!phon) {
        throw new BadRequestException(
          await this.i18n.translate('shipment.error.invalid_phone', lang)
        );
      }

      console.log('[Shipment] Paiement Mobile Money via Pawapay');

      const amountStr = totalAmount.toString();
      const pawapayData = { amount: amountStr, currency: currency || 'USD', provider, phone: phon };

      try {
        const pawapayResponse = await this.pawapayService.createDepositSimple(pawapayData);
        console.log('[Shipment] RÃ©ponse Pawapay :', JSON.stringify(pawapayResponse, null, 2));

        const depositStatus = pawapayResponse.finalStatus?.data?.status;
        const failureReason = pawapayResponse.finalStatus?.data?.failureReason;

        console.log(`[Shipment] Statut final Pawapay: ${depositStatus}`);

        if (depositStatus === 'COMPLETED') {
          console.log('[Shipment] âœ… Paiement confirmÃ© : COMPLETED');
        } else if (depositStatus === 'REJECTED') {
          console.log('[Shipment] âŒ Paiement rejetÃ©');
          if (failureReason?.failureMessage) {
            throw new BadRequestException(failureReason.failureMessage);
          }
          throw new BadRequestException(
            await this.i18n.translate('shipment.error.pawapay_failed', lang)
          );
        } else if (depositStatus === 'FAILED') {
          console.log('[Shipment] âŒ Paiement Ã©chouÃ©');
          if (failureReason?.failureMessage) {
            throw new BadRequestException(failureReason.failureMessage);
          }
          throw new BadRequestException(
            await this.i18n.translate('shipment.error.pawapay_failed', lang)
          );
        } else if (depositStatus === 'CANCELED') {
          console.log('[Shipment] âŒ Paiement annulÃ©');
          throw new BadRequestException('Le paiement a Ã©tÃ© annulÃ©.');
        } else if (depositStatus === 'EXPIRED') {
          console.log('[Shipment] âŒ Paiement expirÃ©');
          throw new BadRequestException('Le paiement a expirÃ©. Veuillez rÃ©essayer.');
        } else if (depositStatus === 'TIMEOUT') {
          console.log('[Shipment] â³ Timeout du polling');
          throw new BadRequestException(
            'Le paiement est en attente de confirmation. Veuillez vÃ©rifier le statut plus tard.'
          );
        } else if (depositStatus === 'ACCEPTED' || depositStatus === 'PENDING' ||
          depositStatus === 'PROCESSING' || depositStatus === 'WAITING') {
          console.log(`[Shipment] â³ Statut en attente: ${depositStatus}`);
        } else {
          console.log(`[Shipment] âŒ Statut inconnu: ${depositStatus}`);
          throw new BadRequestException(
            await this.i18n.translate('shipment.error.pawapay_failed', lang)
          );
        }

        try {
          const fpayResponse = await this.fpayService.payWithMobileMoney(
            totalAmount,
            currency || 'USD',
            `Paiement du colis ${shipment.trackingNumber}`,
            'MOBILE_MONEY',
            lang
          );

          if (fpayResponse?.data?.transaction?.status === 'SUCCESS') {
            fpayTransactionId = fpayResponse.data.transaction.id;
            fpayReference = fpayResponse.data.transaction.reference;
            console.log('[Shipment] âœ… FPAY Mobile Money rÃ©ussi:', {
              transactionId: fpayTransactionId,
              reference: fpayReference,
            });
          } else {
            console.log('[Shipment] âš ï¸ FPAY Mobile Money Ã©chouÃ© (ignorÃ©)');
          }
        } catch (error: any) {
          console.log('[Shipment] FPAY Mobile Money ignorÃ©:', error.message);
        }

      } catch (error: any) {
        console.error('[Shipment] Erreur Pawapay:', error.message);

        if (error instanceof BadRequestException) {
          throw error;
        }

        throw new BadRequestException(
          error.message || await this.i18n.translate('shipment.error.pawapay_failed', lang)
        );
      }
    }

    // ============================================
    // ðŸ†• FIDÃ‰LITÃ‰ - RÃ‰CUPÃ‰RATION DE L'ENTREPRISE ET POURCENTAGES
    // ============================================
    let loyaltyFeePercentage = 0;
    let loyaltyCode = shipment.loyaltyCode || undefined;
    let loyaltyCodeFournisseur = shipment.loyaltyCodeFournisseur || undefined;

    // RÃ©cupÃ©rer la company
    let mainCompany: CompanyEntity | null = shipment.shippingCompany || null;

    if (!mainCompany && shipment.pickupCompany) {
      mainCompany = shipment.pickupCompany;
    } else if (!mainCompany && shipment.deliveryCompany) {
      mainCompany = shipment.deliveryCompany;
    }

    if (!mainCompany && shipment.user?.activeCompanyId) {
      mainCompany = await this.companyRepo.findOne({
        where: { id: shipment.user.activeCompanyId },
      });
    }

    console.log('[Fidelity] ðŸ” Company trouvÃ©e:', mainCompany?.id || 'Non trouvÃ©e');

    // RÃ©cupÃ©rer les paramÃ¨tres de la company
    if (mainCompany) {
      const companySettings = await this.companySettingsRepo.findOne({
        where: { companyId: mainCompany.id },
      });

      if (companySettings) {
        loyaltyFeePercentage = companySettings.loyaltyFeeFixed || 0;
        console.log('[Fidelity] ðŸ” Pourcentage rÃ©cupÃ©rÃ©:', loyaltyFeePercentage);
      } else {
        loyaltyFeePercentage = 5.00;
        console.log('[Fidelity] âš ï¸ Aucun paramÃ¨tre, utilisation de 5% par dÃ©faut');
      }
    } else {
      loyaltyFeePercentage = 5.00;
      console.log('[Fidelity] âš ï¸ Aucune company, utilisation de 5% par dÃ©faut');
    }

    // ============================================
    // ðŸ†• CALCUL DES FRAIS (50% CLIENT / 50% FOURNISSEUR)
    // ============================================
    const totalFees = (totalAmount * loyaltyFeePercentage) / 100;
    const loyaltyFeeClient = totalFees / 2;
    const loyaltyFeeFournisseur = totalFees / 2;

    console.log('[Fidelity] ðŸ” RÃ©partition des frais:', {
      totalFees,
      loyaltyFeeClient,
      loyaltyFeeFournisseur,
      percentageTotal: loyaltyFeePercentage,
    });

    // ============================================
    // ðŸ†• PAIEMENT AU CLIENT (EXPÃ‰DITEUR) - 50%
    // ============================================
    if (loyaltyCode && loyaltyFeeClient > 0) {
      const userLoyalty = await this.userLoyaltyRepo.findOne({
        where: { loyaltyCode: loyaltyCode, isActive: true },
        relations: ['user'],
      });

      if (userLoyalty) {
        const recipientUser = userLoyalty.user;

        if (recipientUser?.userIdFpay) {
          const fpayData = {
            userId: recipientUser.userIdFpay,
            amount: loyaltyFeeClient,
            description: `Frais de fidÃ©litÃ© (50%) pour le colis ${shipment.trackingNumber}`,
            currency: 'USD',
            countryCode: 'CD',
          };

          console.log('[Fidelity] ðŸ“¤ Envoi FPAY au client:', fpayData);

          try {
            const fpayResponse = await this.fpayService.makeSend(fpayData, user_active);

            if (fpayResponse?.data?.transaction?.status === 'SUCCESS') {
              const loyaltyHistory = this.loyaltyHistoryRepo.create({
                userId: recipientUser.id,
                loyaltyId: userLoyalty.id,
                points: Math.round(loyaltyFeeClient * 100),
                pointsBefore: userLoyalty.pointsBalance,
                pointsAfter: userLoyalty.pointsBalance + Math.round(loyaltyFeeClient * 100),
                transactionType: LoyaltyTransactionType.EARN,
                sourceType: LoyaltySourceType.SHIPMENT,
                sourceId: shipment.id,
                description: `Frais de fidÃ©litÃ© (50%) pour l'expÃ©dition ${shipment.trackingNumber}`,
                expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                isExpired: false,
              });
              await this.loyaltyHistoryRepo.save(loyaltyHistory);

              console.log(`[Fidelity] âœ… ${loyaltyFeeClient} USD envoyÃ© au client (50%) ${recipientUser.id}`);
            }
          } catch (error) {
            console.error('[Fidelity] âŒ Erreur envoi FPAY client:', error.message);
          }
        }
      }
    }

    // ============================================
    // ðŸ†• PAIEMENT AU FOURNISSEUR - 50%
    // ============================================
    if (loyaltyCodeFournisseur && loyaltyFeeFournisseur > 0) {
      const fournisseurLoyalty = await this.userLoyaltyRepo.findOne({
        where: { loyaltyCode: loyaltyCodeFournisseur, isActive: true },
        relations: ['user'],
      });

      if (fournisseurLoyalty) {
        const recipientUser = fournisseurLoyalty.user;

        if (recipientUser?.userIdFpay) {
          const fpayData = {
            userId: recipientUser.userIdFpay,
            amount: loyaltyFeeFournisseur,
            description: `Frais de fidÃ©litÃ© (50%) fournisseur pour le colis ${shipment.trackingNumber}`,
            currency: 'USD',
            countryCode: 'CD',
          };

          console.log('[Fidelity] ðŸ“¤ Envoi FPAY au fournisseur:', fpayData);

          try {
            const fpayResponse = await this.fpayService.makeSend(fpayData, user_active);

            if (fpayResponse?.data?.transaction?.status === 'SUCCESS') {
              const loyaltyHistory = this.loyaltyHistoryRepo.create({
                userId: recipientUser.id,
                loyaltyId: fournisseurLoyalty.id,
                points: Math.round(loyaltyFeeFournisseur * 100),
                pointsBefore: fournisseurLoyalty.pointsBalance,
                pointsAfter: fournisseurLoyalty.pointsBalance + Math.round(loyaltyFeeFournisseur * 100),
                transactionType: LoyaltyTransactionType.EARN,
                sourceType: LoyaltySourceType.SHIPMENT,
                sourceId: shipment.id,
                description: `Frais de fidÃ©litÃ© (50%) fournisseur pour l'expÃ©dition ${shipment.trackingNumber}`,
                expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                isExpired: false,
              });
              await this.loyaltyHistoryRepo.save(loyaltyHistory);

              console.log(`[Fidelity] âœ… ${loyaltyFeeFournisseur} USD envoyÃ© au fournisseur (50%) ${recipientUser.id}`);
            }
          } catch (error) {
            console.error('[Fidelity] âŒ Erreur envoi FPAY fournisseur:', error.message);
          }
        }
      }
    }

    // ============================================
    // SUITE DE LA COLLECTE
    // ============================================

    if (deliveryFrom !== undefined) shipment.deliveryFrom = deliveryFrom;
    if (deliveryTo !== undefined) shipment.deliveryTo = deliveryTo;
    if (deliveryAddressId !== undefined) shipment.deliveryAddressId = deliveryAddressId;
    if (deliveryPrice !== undefined) shipment.deliveryPrice = deliveryPrice;
    const now = new Date();
    shipment.paid = true;
    shipment.pin = GeneratePin.generate();
    shipment.collectedAt = now;
    const operationReference = this.generateOperationReference();
    await this.shipmentRepo.save(shipment);

    // âœ… Enregistrement de l'opÃ©ration
    const operationData: Partial<OperationEntity> = {
      debit: amount,
      credit: 0,
      shipmentId: shipment.id,
      designation: await this.i18n.translate('shipment.operation.payment_designation', lang, { trackingNumber: shipment.trackingNumber }),
      status: OperationStatus.ACCEPTED,
      userId: user_active.id,
      paymentMethod: selectedMethod,
      reference: operationReference,
    };

    if (selectedMethod === PaymentMethod.FPAY) {
      operationData.fpayTransactionId = fpayTransactionId || '';
      operationData.fpayReference = fpayReference || '';
    }

    if (selectedMethod === PaymentMethod.MOBILE_MONEY && provider) {
      operationData.provider = provider;
    }

    await this.operation.save(operationData);

    const clientPhone = shipment.clientPhone;
    if (clientPhone) {
      const message = await this.i18n.translate('shipment.sms.collection_confirm', lang, {
        trackingNumber: shipment.trackingNumber,
        amount: totalAmount,
        currency: 'USD',
        pin: shipment.pin,
      });
      await this.smsHelper.sendSms(clientPhone, message);
    }

    return {
      data: shipment,
      shipmentId: shipment.id,
      amountCollected: totalAmount,
      status: shipment.status,
      deliveryFrom: shipment.deliveryFrom,
      deliveryTo: shipment.deliveryTo,
      deliveryAddressId: shipment.deliveryAddressId,
      deliveryPrice: shipment.deliveryPrice,
      totalPrice: shipment.totalPrice,
    };
  }

  async collectShipmentAdmin(
    shipmentId: string,
    user: UserEntity,
    body: CollectShipmentBodyAdminDto,
    lang: string = 'fr',
  ): Promise<CollectShipmentResponseDto> {
    const { amount, password } = body;
    const operationReference = this.generateOperationReference();
    const userActive = await this.userRepo.findOne({ where: { id: user.id } });
    if (!userActive) throw new BadRequestException(await this.i18n.translate('shipment.error.user_not_recognized', lang));
    if (!userActive.password) throw new BadRequestException(await this.i18n.translate('shipment.error.admin_password_missing', lang));
    const isPasswordValid = await bcrypt.compare(password, userActive.password);
    if (!isPasswordValid) throw new BadRequestException(await this.i18n.translate('shipment.error.invalid_admin_password', lang));

    const shipment = await this.shipmentRepo.findOne({
      where: { id: shipmentId },
      relations: ['package', 'trackings', 'shippingCompany', 'user', 'pickupCompany', 'deliveryCompany'],
    });
    if (!shipment) throw new NotFoundException(await this.i18n.translate('shipment.error.not_found', lang, { id: shipmentId }));
    if (shipment.paid) throw new BadRequestException(await this.i18n.translate('shipment.error.already_paid', lang));
    if (shipment.shippingPrice === null || shipment.shippingPrice === undefined) {
      throw new BadRequestException(await this.i18n.translate('shipment.error.no_price', lang));
    }
    if (shipment.shippingPrice !== amount) {
      throw new BadRequestException(await this.i18n.translate('shipment.error.amount_mismatch', lang, { amount, expected: shipment.shippingPrice }));
    }

    // ============================================
    // ðŸ†• RÃ‰CUPÃ‰RATION DE L'ENTREPRISE ET DE SES POURCENTAGES
    // ============================================
    let loyaltyFeePercentage = 0;

    // 1ï¸âƒ£ RÃ©cupÃ©rer la company
    let mainCompany: CompanyEntity | null = shipment.shippingCompany || null;

    if (!mainCompany && shipment.pickupCompany) {
      mainCompany = shipment.pickupCompany;
    } else if (!mainCompany && shipment.deliveryCompany) {
      mainCompany = shipment.deliveryCompany;
    }

    if (!mainCompany && shipment.user?.activeCompanyId) {
      mainCompany = await this.companyRepo.findOne({
        where: { id: shipment.user.activeCompanyId },
      });
    }

    console.log('[Fidelity] ðŸ” Company trouvÃ©e:', mainCompany?.id || 'Non trouvÃ©e');

    // 2ï¸âƒ£ RÃ©cupÃ©rer les paramÃ¨tres de la company
    if (mainCompany) {
      const companySettings = await this.companySettingsRepo.findOne({
        where: { companyId: mainCompany.id },
      });

      if (companySettings) {
        // âœ… RÃ©cupÃ©rer le pourcentage total (5%)
        loyaltyFeePercentage = companySettings.loyaltyFeeFixed || 0;
        console.log('[Fidelity] ðŸ” Pourcentage total rÃ©cupÃ©rÃ©:', loyaltyFeePercentage);
      } else {
        // Fallback si pas de paramÃ¨tres
        loyaltyFeePercentage = 5.00;
        console.log('[Fidelity] âš ï¸ Aucun paramÃ¨tre trouvÃ©, utilisation de 5% par dÃ©faut');
      }
    } else {
      // Fallback si pas de company
      loyaltyFeePercentage = 5.00;
      console.log('[Fidelity] âš ï¸ Aucune company trouvÃ©e, utilisation de 5% par dÃ©faut');
    }

    // ============================================
    // ðŸ†• CALCUL DES FRAIS (50% CLIENT / 50% FOURNISSEUR)
    // ============================================
    const totalFees = (amount * loyaltyFeePercentage) / 100;
    const loyaltyFeeClient = totalFees / 2;  // 50% pour le client
    const loyaltyFeeFournisseur = totalFees / 2;  // 50% pour le fournisseur

    console.log('[Fidelity] ðŸ” RÃ©partition des frais:', {
      totalFees,
      loyaltyFeeClient,
      loyaltyFeeFournisseur,
      percentageTotal: loyaltyFeePercentage,
    });

    // ============================================
    // ðŸ†• RÃ‰CUPÃ‰RATION DES CODES DE FIDÃ‰LITÃ‰
    // ============================================
    const loyaltyCode = shipment.loyaltyCode || undefined;
    const loyaltyCodeFournisseur = shipment.loyaltyCodeFournisseur || undefined;

    console.log('[Fidelity] ðŸ” Code client:', loyaltyCode);
    console.log('[Fidelity] ðŸ” Code fournisseur:', loyaltyCodeFournisseur);

    // ============================================
    // ðŸ†• PAIEMENT AU CLIENT (EXPÃ‰DITEUR) - 50%
    // ============================================
    if (loyaltyCode && loyaltyFeeClient > 0) {
      const userLoyalty = await this.userLoyaltyRepo.findOne({
        where: { loyaltyCode: loyaltyCode, isActive: true },
        relations: ['user'],
      });

      if (userLoyalty) {
        const recipientUser = userLoyalty.user;

        console.log('[Fidelity] ðŸ” Paiement client - 50%:', {
          loyaltyFeeClient,
          recipientId: recipientUser?.id,
        });

        if (recipientUser?.userIdFpay) {
          const fpayData = {
            userId: recipientUser.userIdFpay,
            amount: loyaltyFeeClient,
            description: `Frais de fidÃ©litÃ© (50%) pour le colis ${shipment.trackingNumber}`,
            currency: 'USD',
            countryCode: 'CD',
          };

          const fpayResponse = await this.fpayService.makeSend(fpayData, userActive);

          if (fpayResponse?.data?.transaction?.status === 'SUCCESS') {
            const loyaltyHistory = this.loyaltyHistoryRepo.create({
              userId: recipientUser.id,
              loyaltyId: userLoyalty.id,
              points: Math.round(loyaltyFeeClient * 100),
              pointsBefore: userLoyalty.pointsBalance,
              pointsAfter: userLoyalty.pointsBalance + Math.round(loyaltyFeeClient * 100),
              transactionType: LoyaltyTransactionType.EARN,
              sourceType: LoyaltySourceType.SHIPMENT,
              sourceId: shipment.id,
              description: `Frais de fidÃ©litÃ© (50%) pour l'expÃ©dition ${shipment.trackingNumber}`,
              expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
              isExpired: false,
            });
            await this.loyaltyHistoryRepo.save(loyaltyHistory);

            console.log(`[Fidelity] âœ… ${loyaltyFeeClient} USD envoyÃ© au client (50%) ${recipientUser.id}`);
          }
        }
      }
    }

    // ============================================
    // ðŸ†• PAIEMENT AU FOURNISSEUR - 50%
    // ============================================
    if (loyaltyCodeFournisseur && loyaltyFeeFournisseur > 0) {
      const fournisseurLoyalty = await this.userLoyaltyRepo.findOne({
        where: { loyaltyCode: loyaltyCodeFournisseur, isActive: true },
        relations: ['user'],
      });

      if (fournisseurLoyalty) {
        const recipientUser = fournisseurLoyalty.user;

        console.log('[Fidelity] ðŸ” Paiement fournisseur - 50%:', {
          loyaltyFeeFournisseur,
          recipientId: recipientUser?.id,
        });

        if (recipientUser?.userIdFpay) {
          const fpayData = {
            userId: recipientUser.userIdFpay,
            amount: loyaltyFeeFournisseur,
            description: `Frais de fidÃ©litÃ© (50%) fournisseur pour le colis ${shipment.trackingNumber}`,
            currency: 'USD',
            countryCode: 'CD',
          };

          const fpayResponse = await this.fpayService.makeSend(fpayData, userActive);

          if (fpayResponse?.data?.transaction?.status === 'SUCCESS') {
            const loyaltyHistory = this.loyaltyHistoryRepo.create({
              userId: recipientUser.id,
              loyaltyId: fournisseurLoyalty.id,
              points: Math.round(loyaltyFeeFournisseur * 100),
              pointsBefore: fournisseurLoyalty.pointsBalance,
              pointsAfter: fournisseurLoyalty.pointsBalance + Math.round(loyaltyFeeFournisseur * 100),
              transactionType: LoyaltyTransactionType.EARN,
              sourceType: LoyaltySourceType.SHIPMENT,
              sourceId: shipment.id,
              description: `Frais de fidÃ©litÃ© (50%) fournisseur pour l'expÃ©dition ${shipment.trackingNumber}`,
              expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
              isExpired: false,
            });
            await this.loyaltyHistoryRepo.save(loyaltyHistory);

            console.log(`[Fidelity] âœ… ${loyaltyFeeFournisseur} USD envoyÃ© au fournisseur (50%) ${recipientUser.id}`);
          }
        }
      }
    }

    // ============================================
    // SUITE DE LA COLLECTE ADMIN
    // ============================================
    const now = new Date();
    shipment.paid = true;
    shipment.pin = GeneratePin.generate();
    shipment.collectedAt = now;
    const ship = await this.shipmentRepo.save(shipment);

    await this.operation.save({
      debit: amount,
      credit: 0,
      shipmentId: shipment.id,
      designation: await this.i18n.translate('shipment.operation.admin_payment_designation', lang, { trackingNumber: shipment.trackingNumber }),
      status: OperationStatus.ACCEPTED,
      userId: userActive.id,
      paymentMethod: PaymentMethod.CASH,
      provider: 'ADMIN_CASH_DESK',
      reference: operationReference,
    });

    if (shipment.clientPhone) {
      const message = await this.i18n.translate('shipment.sms.collection_confirm', lang, {
        trackingNumber: shipment.trackingNumber,
        amount: amount,
        currency: 'USD',
        pin: shipment.pin,
      });
      await this.smsHelper.sendSms(shipment.clientPhone, message);
    }

    return {
      message: await this.i18n.translate('shipment.collect_admin_success', lang),
      data: ship,
    };
  }

  async confirmPickupByPin(
    pin: string,
    user: UserEntity,
    lang: string = 'fr',
  ): Promise<{ message?: string; shipment?: Shipment }> {
    const userFull = await this.userRepo.findOne({
      where: { id: user.id },
      relations: [
        'activeCompany',
        'userHasCompany',
        'userHasCompany.company',
        'userHasCompany.branch',
        'userPlatformRoles',
        'userPlatformRoles.platform',
        'userPlatformRoles.role',
      ],
    });
    if (!userFull) throw new NotFoundException(await this.i18n.translate('shipment.error.user_not_found', lang, { id: user.id }));

    const isSuperAdmin = userFull.role === UserRole.SUPER_ADMIN;
    const isLinkedToLogistique = userFull.userPlatformRoles?.some(
      (upr) => upr.platform?.key === 'LOGISTIQUE' && upr.role != null,
    );
    if (!isSuperAdmin && !isLinkedToLogistique) {
      throw new ForbiddenException(await this.i18n.translate('shipment.error.pin_access_denied', lang));
    }

    const shipment = await this.shipmentRepo.findOne({
      where: { pin },
      relations: [
        'package',
        'user',
        'userAssign',
        'deliveryAddress',
        'pickupCompany',
        'shippingCompany',
        'deliveryCompany',
        'ltaShipments',
        'ltaShipments.lta',
      ],
    });
    if (!shipment) throw new NotFoundException(await this.i18n.translate('shipment.error.pin_not_found', lang));
    if (shipment.status === ShipmentStatus.COLLECTED) {
      throw new BadRequestException(await this.i18n.translate('shipment.error.already_collected', lang));
    }

    await this.dataSource.transaction(async (manager) => {
      shipment.status = ShipmentStatus.COLLECTED;
      shipment.userAssignId = userFull.id;
      shipment.collectedAt = new Date();
      await manager.save(shipment);
    });

    const activeCompanyId = userFull.activeCompanyId;
    let targetBranchId: string | undefined;
    if (activeCompanyId) {
      const activeUserHasCompany = userFull.userHasCompany?.find(
        (uhc) => uhc.company?.id === activeCompanyId,
      );
      targetBranchId = activeUserHasCompany?.branchId;
      if (!targetBranchId) {
        const firstBranch = await this.branchRepo.findOne({
          where: { company_id: activeCompanyId },
          order: { createdAt: 'ASC' },
        });
        targetBranchId = firstBranch?.id;
      }
    }

    let recipients: UserEntity[] = [];
    let userIds: string[] = [];
    if (activeCompanyId && targetBranchId) {
      userIds = await this.permissionHelper.getUsersWithManagePermissionOnResource(
        activeCompanyId,
        targetBranchId,
        'RETRAITS',
      );
      if (userIds.length) recipients = await this.userRepo.findByIds(userIds);
    }
    const uniqueRecipients = recipients.filter(
      (r, i, self) => self.findIndex((u) => u.id === r.id) === i,
    );

    const clientInfo = {
      clientName: shipment.clientName || shipment.user?.fullName || 'Client',
      clientPhone: shipment.clientPhone || shipment.user?.phone || 'Non renseignÃ©',
      trackingNumber: shipment.trackingNumber,
      email: shipment.user?.email || 'Non renseignÃ©',
    };
    const notificationData = {
      id: shipment.id,
      trackingNumber: shipment.trackingNumber,
      clientName: clientInfo.clientName,
      clientPhone: clientInfo.clientPhone,
      clientEmail: clientInfo.email,
      collectedAt: shipment.collectedAt,
      collectedBy: userFull.fullName || userFull.email,
      status: shipment.status,
    };

    for (const recipient of uniqueRecipients) {
      await this.notificationsService.sendNotificationToUser(
        recipient.id,
        await this.i18n.translate('shipment.notification.collected_title', lang),
        await this.i18n.translate('shipment.notification.collected_body', lang, {
          trackingNumber: clientInfo.trackingNumber,
          clientName: clientInfo.clientName,
          clientPhone: clientInfo.clientPhone,
        }),
        NotificationType.LOGISTIC,
        notificationData,
      );
    }

    const updatedShipment = await this.shipmentRepo.findOne({
      where: { id: shipment.id },
      relations: [
        'user',
        'package',
        'deliveryAddress',
        'pickupCompany',
        'shippingCompany',
        'deliveryCompany',
      ],
    });

    return {
      message: await this.i18n.translate('shipment.collect_success', lang),
      shipment: updatedShipment || shipment,
    };
  }

  async findAllByUserAssign(
    userAssignId: string,
    page: number = 1,
    limit: number = 5,
    lang: string = 'fr',
  ): Promise<{ data: Shipment[]; total: number; page: number; limit: number }> {
    const skip = (page - 1) * limit;
    const [data, total] = await this.shipmentRepo.findAndCount({
      where: { userAssignId },
      relations: [
        'package',
        'pickupTransportType',
        'user',
        'trackings',
        'ltaShipments',
        'ltaShipments.lta',
        'deliveryAddress',
      ],
      order: { collectedAt: 'DESC' },
      skip,
      take: limit,
    });
    return { data, total, page, limit };
  }
}