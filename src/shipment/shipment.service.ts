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
import * as bcrypt from 'bcrypt';
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
import { LoyaltySourceType, LoyaltyTransactionType, UserLoyaltyEntity } from 'src/users/entities/user-loyalty.entity';
import { CompanySettingsEntity } from 'src/company/entities/company-settings.entity';
import { UserLoyaltyHistoryEntity } from 'src/users/entities/user-loyalty-history.entity';

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
  ) { }

  // ----------------------------------------------------------------------
  // MÉTHODES PRIVÉES
  // ----------------------------------------------------------------------
  // Remplacer la méthode privée par :
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

      const notificationOptions: any = {
        userId: currentUser.id,
        pushTitle: await this.i18n.translate('shipment.push.created_title', lang),
        pushBody: await this.i18n.translate('shipment.push.created_body', lang, {
          trackingNumber: shipment.trackingNumber,
        }),
        pushData: { entity: 'SHIPMENT', entityId: shipment.id },
      };

      if (hasEmail) {
        notificationOptions.emailTo = currentUser.email;
        notificationOptions.emailSubject = await this.i18n.translate('shipment.email.created_subject', lang);
        notificationOptions.emailTemplate = 'shipment.ejs';
        notificationOptions.emailContext = {
          user: {
            id: currentUser.id,
            fullName: currentUser.fullName,
            email: currentUser.email,
            phone: currentUser.phone,
            city: currentUser.city,
            country: currentUser.country,
          },
          shipment: {
            id: shipment.id,
            trackingNumber: shipment.trackingNumber,
            status: shipment.status,
            pickupEnabled: shipment.pickupEnabled,
            shippingEnabled: shipment.shippingEnabled,
            deliveryEnabled: shipment.deliveryEnabled,
            pickupFrom: shipment.pickupFrom,
            pickupTo: shipment.pickupTo,
            shippingFrom: shipment.shippingFrom,
            shippingTo: shipment.shippingTo,
            deliveryFrom: shipment.deliveryAddress?.address ?? '',
            deliveryTo: shipment.deliveryAddress?.address ?? '',
            deliveryContactName: shipment.deliveryAddress
              ? `${shipment.deliveryAddress.firstName} ${shipment.deliveryAddress.lastName}`
              : '',
            deliveryContactPhone: shipment.deliveryAddress?.phone ?? '',
            pickupContactName: shipment.pickupContactName,
            pickupContactPhone: shipment.pickupContactPhone,
            whatsapp_number: shipment.whatsapp_number,
            paymentMethod: shipment.paymentMethod,
            createdAt: shipment.createdAt,
            pickupCompany: shipment.pickupCompany
              ? {
                id: shipment.pickupCompany.id,
                companyName: shipment.pickupCompany.companyName,
                phone: shipment.pickupCompany.phone,
                email: shipment.pickupCompany.email,
                address: shipment.pickupCompany.address,
              }
              : null,
            shippingCompany: shipment.shippingCompany
              ? {
                id: shipment.shippingCompany.id,
                companyName: shipment.shippingCompany.companyName,
                phone: shipment.shippingCompany.phone,
                email: shipment.shippingCompany.email,
                address: shipment.shippingCompany.address,
              }
              : null,
            deliveryCompany: shipment.deliveryCompany
              ? {
                id: shipment.deliveryCompany.id,
                companyName: shipment.deliveryCompany.companyName,
                phone: shipment.deliveryCompany.phone,
                email: shipment.deliveryCompany.email,
                address: shipment.deliveryCompany.address,
              }
              : null,
            package: {
              description: packageEntity.description,
              external_quantity: packageEntity.external_quantity,
              weight: packageEntity.weight,
              dimensions: packageEntity.dimensions,
              value: packageEntity.value,
              fragile: packageEntity.fragile,
            },
          },
        };
        notificationOptions.sendShipmentPdf = true;
      }

      if (hasPhone) {
        notificationOptions.phoneNumber = currentUser.phone;
        notificationOptions.smsBody = await this.i18n.translate('shipment.sms.created_body', lang, {
          trackingNumber: shipment.trackingNumber,
        });
      }

      await this.pushNotificationHelper.sendAll(notificationOptions);

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

      await this.notificationHelper.sendNotification(
        this.notificationsService,
        currentUser.id,
        NotificationType.SHIPMENT_CREATED,
        lang,
        {
          trackingNumber: shipment.trackingNumber,
          status: shipment.status,
          message: await this.i18n.translate('shipment.inapp.created_message', lang, {
            trackingNumber: shipment.trackingNumber,
          }),
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

  // ----------------------------------------------------------------------
  // MÉTHODES PUBLIQUES
  // ----------------------------------------------------------------------
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
      loyaltyCode, // ✅ Ajout
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
    shipment.loyaltyCode = loyaltyCode || undefined;

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

    let targetUser: UserEntity | null = null;

    if (userId) {
      targetUser = await this.userRepo.findOne({ where: { id: userId } });
      if (!targetUser) {
        throw new NotFoundException(
          await this.i18n.translate('shipment.error.user_not_found', lang, { id: userId }),
        );
      }
      shipment.userId = targetUser.id;
    } else if (clientPhone) {
      const foundUser = await this.userRepo.findOne({ where: { phone: clientPhone } });
      if (foundUser) {
        targetUser = foundUser;
        shipment.userId = targetUser.id;
      }
    }

    shipment.clientName = clientName;
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

    if (targetUser) {
      this.processShipmentNotifications(shipmentWithRelations, packageEntity, targetUser, lang).catch((err) =>
        console.error('Erreur notifications colis:', err),
      );
    } else if (clientPhone) {
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
    file?: Express.Multer.File,
    lang: string = 'fr',
  ): Promise<{ message: string; data: Shipment }> {
    const shipment = await this.shipmentRepo.findOne({
      where: { id },
      relations: [
        'package',
        'pickupTransportType',
        'user',
        'trackings',
        'ltaShipments',
        'pickupCompany',
        'shippingCompany',
        'deliveryCompany',
      ],
    });
    if (!shipment) throw new NotFoundException(await this.i18n.translate('shipment.error.not_found', lang, { id }));

    if (dto.userId) {
      const user = await this.userRepo.findOneBy({ id: dto.userId });
      if (!user) throw new NotFoundException(await this.i18n.translate('shipment.error.user_not_found', lang, { id: dto.userId }));
      shipment.userId = user.id;
      shipment.clientName = undefined;
      shipment.clientPhone = undefined;
    } else {
      if (dto.clientName !== undefined) shipment.clientName = dto.clientName;
      if (dto.clientPhone !== undefined) shipment.clientPhone = dto.clientPhone;
    }

    if (dto.pickupCompanyId !== undefined) shipment.pickupCompanyId = dto.pickupCompanyId;
    if (dto.shippingCompanyId !== undefined) shipment.shippingCompanyId = dto.shippingCompanyId;
    if (dto.deliveryCompanyId !== undefined) shipment.deliveryCompanyId = dto.deliveryCompanyId;

    if (dto.status !== undefined) shipment.status = dto.status;
    if (dto.pickupEnabled !== undefined) shipment.pickupEnabled = dto.pickupEnabled;
    if (dto.shippingEnabled !== undefined) shipment.shippingEnabled = dto.shippingEnabled;
    if (dto.deliveryEnabled !== undefined) shipment.deliveryEnabled = dto.deliveryEnabled;

    // ✅ Correction pour update avec null
    if (dto.loyaltyCode !== undefined) {
      shipment.loyaltyCode = dto.loyaltyCode ?? undefined;
    }

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
    if (shipment.shippingEnabled) {
      if (dto.shippingFrom) shipment.shippingFrom = dto.shippingFrom;
      if (dto.shippingTo) shipment.shippingTo = dto.shippingTo;
    }
    if (shipment.deliveryEnabled && dto.deliveryAddressId) {
      shipment.deliveryAddressId = dto.deliveryAddressId;
    }

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

    if (file) {
      if (shipment.image) {
        try {
          const oldFilename = shipment.image.split('/').pop()!;
          await this.filesService.deleteFile('shipment', oldFilename);
        } catch (err) {
          console.warn('Impossible de supprimer l’ancienne image:', err);
        }
      }
      const uploadedFile = await this.filesService.uploadFile(file, 'shipment', 'product');
      shipment.image = uploadedFile.data;
    }

    if (dto.pickupPrice !== undefined) shipment.pickupPrice = dto.pickupPrice;
    if (dto.shippingPrice !== undefined) shipment.shippingPrice = dto.shippingPrice;
    if (dto.deliveryPrice !== undefined) shipment.deliveryPrice = dto.deliveryPrice;
    shipment.totalPrice = dto.totalPrice ?? (shipment.pickupPrice ?? 0) + (shipment.shippingPrice ?? 0) + (shipment.deliveryPrice ?? 0);

    await this.shipmentRepo.save(shipment);

    const updatedShipment = await this.shipmentRepo.findOne({
      where: { id },
      relations: [
        'package',
        'pickupTransportType',
        'user',
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
            addressUser: { address: shipment.deliveryAddress?.address || 'Non spécifiée' },
            invoiceNumber: shipment.trackingNumber,
            paymentStatus: shipment.paymentMethod || 'paid',
            pin: shipment.pin,
          },
          clientName: shipment.user?.fullName || 'Client',
          pinCode: shipment.pin,
          trackingNumber: shipment.trackingNumber,
          shipmentReference: shipment.trackingNumber,
          weight: shipment.package?.weight ? `${shipment.package.weight} kg` : 'Non spécifié',
          dimensions: shipment.package?.dimensions || 'Non spécifiées',
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
      .leftJoinAndSelect('shipment.trackings', 'trackings')
      .leftJoinAndSelect('shipment.ltaShipments', 'ltaShipments')
      .leftJoinAndSelect('ltaShipments.lta', 'lta')
      .leftJoinAndSelect('lta.tracking', 'ltaTracking')
      .leftJoinAndSelect('shipment.deliveryAddress', 'deliveryAddress')
      .leftJoinAndSelect('shipment.pickupCompany', 'pickupCompany')
      .leftJoinAndSelect('shipment.shippingCompany', 'shippingCompany')
      .leftJoinAndSelect('shipment.deliveryCompany', 'deliveryCompany');

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
        lta.ltaNumber LIKE :search OR
        lta.externalLtaNumber LIKE :search OR
        user.fullName LIKE :search OR
        user.email LIKE :search OR
        user.phone LIKE :search OR
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
        'shippingCompany',
        'deliveryCompany',
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
        'trackings',
        'ltaShipments',
        'ltaShipments.lta',
        'deliveryAddress',
        'pickupCompany',
        'shippingCompany',
        'deliveryCompany',
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
      paymentMethod, // ✅ Ajouté pour FPAY
      pin, // ✅ Ajouté pour FPAY
    } = body;

    const shipment = await this.shipmentRepo.findOne({ where: { id: shipmentId } });
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

    // ✅ AJOUT FPAY - SHIPMENT
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

      // ✅ Appel au service FPay - toutes les exceptions sont gérées dans le service
      const fpayResponse = await this.fpayService.makePayment(fpayData, user);

      // ✅ Si on arrive ici, le paiement est réussi
      if (fpayResponse?.data?.transaction?.status === 'SUCCESS') {
        fpayTransactionId = fpayResponse.data.transaction.id;
        fpayReference = fpayResponse.data.transaction.reference;

        console.log('[Shipment] ✅ Paiement FPAY réussi:', {
          transactionId: fpayTransactionId,
          reference: fpayReference,
          amount: fpayResponse.data.transaction.amount,
        });
      }
    }
    // ✅ FIN AJOUT FPAY - SHIPMENT
    // ✅ PAIEMENT MOBILE_MONEY (Pawapay)
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

      // ✅ Paiement Mobile Money via Pawapay
      console.log('[Shipment] Paiement Mobile Money via Pawapay');

      const amount = totalAmount.toString();
      const pawapayData = { amount, currency: currency || 'USD', provider, phone: phon };

      try {
        const pawapayResponse = await this.pawapayService.createDepositSimple(pawapayData);
        console.log('[Shipment] Réponse Pawapay :', JSON.stringify(pawapayResponse, null, 2));

        const depositStatus = pawapayResponse.finalStatus?.data?.status;
        const failureReason = pawapayResponse.finalStatus?.data?.failureReason;

        console.log(`[Shipment] Statut final Pawapay: ${depositStatus}`);

        // ✅ Si COMPLETED -> Succès
        if (depositStatus === 'COMPLETED') {
          console.log('[Shipment] ✅ Paiement confirmé : COMPLETED');
          // Paiement réussi
        }
        // ✅ Si REJECTED -> Échec (mauvais PIN, etc.)
        else if (depositStatus === 'REJECTED') {
          console.log('[Shipment] ❌ Paiement rejeté');

          if (failureReason?.failureMessage) {
            throw new BadRequestException(failureReason.failureMessage);
          }

          throw new BadRequestException(
            await this.i18n.translate('shipment.error.pawapay_failed', lang)
          );
        }
        // ✅ Si FAILED -> Échec
        else if (depositStatus === 'FAILED') {
          console.log('[Shipment] ❌ Paiement échoué');

          if (failureReason?.failureMessage) {
            throw new BadRequestException(failureReason.failureMessage);
          }

          throw new BadRequestException(
            await this.i18n.translate('shipment.error.pawapay_failed', lang)
          );
        }
        // ✅ Si CANCELED -> Annulé
        else if (depositStatus === 'CANCELED') {
          console.log('[Shipment] ❌ Paiement annulé');
          throw new BadRequestException('Le paiement a été annulé.');
        }
        // ✅ Si EXPIRED -> Expiré
        else if (depositStatus === 'EXPIRED') {
          console.log('[Shipment] ❌ Paiement expiré');
          throw new BadRequestException('Le paiement a expiré. Veuillez réessayer.');
        }
        // ✅ Si TIMEOUT -> Le paiement est en attente depuis trop longtemps
        else if (depositStatus === 'TIMEOUT') {
          console.log('[Shipment] ⏳ Timeout du polling');
          throw new BadRequestException(
            'Le paiement est en attente de confirmation. Veuillez vérifier le statut plus tard.'
          );
        }
        // ✅ Si statut en attente (ACCEPTED, PENDING, etc.)
        else if (depositStatus === 'ACCEPTED' || depositStatus === 'PENDING' ||
          depositStatus === 'PROCESSING' || depositStatus === 'WAITING') {
          console.log(`[Shipment] ⏳ Statut en attente: ${depositStatus}`);
          // Le paiement est en attente, on continue
        }
        // ✅ Si statut inconnu
        else {
          console.log(`[Shipment] ❌ Statut inconnu: ${depositStatus}`);
          throw new BadRequestException(
            await this.i18n.translate('shipment.error.pawapay_failed', lang)
          );
        }

        // ✅ Tenter FPAY en parallèle (optionnel - ne bloque pas)
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
            console.log('[Shipment] ✅ FPAY Mobile Money réussi:', {
              transactionId: fpayTransactionId,
              reference: fpayReference,
            });
          } else {
            console.log('[Shipment] ⚠️ FPAY Mobile Money échoué (ignoré)');
          }
        } catch (error: any) {
          console.log('[Shipment] FPAY Mobile Money ignoré:', error.message);
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

    // ✅ Enregistrement de l'opération avec la bonne méthode
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
    // 🆕 RÉCUPÉRATION DU FRAIS DE FIDÉLITÉ
    // ============================================
    let loyaltyFee = 0;
    let loyaltyCode: string | undefined;

    // 1️⃣ Récupérer le code de fidélité depuis le shipment
    loyaltyCode = shipment.loyaltyCode || undefined;

    console.log('[Fidelity] 🔍 Code de fidélité du shipment:', loyaltyCode);

    if (loyaltyCode) {
      // 2️⃣ Récupérer le compte de fidélité par loyaltyCode
      const userLoyalty = await this.userLoyaltyRepo.findOne({
        where: { loyaltyCode: loyaltyCode, isActive: true },
        relations: ['user'],
      });

      console.log('[Fidelity] 🔍 Compte de fidélité trouvé:', userLoyalty ? 'Oui' : 'Non');

      if (userLoyalty) {
        // 3️⃣ Récupérer la company de livraison (shippingCompany)
        let shippingCompany: CompanyEntity | null = shipment.shippingCompany || null;

        if (!shippingCompany && shipment.pickupCompany) {
          shippingCompany = shipment.pickupCompany;
          console.log('[Fidelity] 🔍 Utilisation de pickupCompany comme fallback');
        } else if (!shippingCompany && shipment.deliveryCompany) {
          shippingCompany = shipment.deliveryCompany;
          console.log('[Fidelity] 🔍 Utilisation de deliveryCompany comme fallback');
        }

        if (!shippingCompany && shipment.user?.activeCompanyId) {
          shippingCompany = await this.companyRepo.findOne({
            where: { id: shipment.user.activeCompanyId },
          });
          console.log('[Fidelity] 🔍 Utilisation de activeCompany de l\'utilisateur:', shippingCompany?.id);
        }

        console.log('[Fidelity] 🔍 Company trouvée:', shippingCompany?.id || 'Non trouvée');

        if (shippingCompany) {
          let companySettings = await this.companySettingsRepo.findOne({
            where: { companyId: shippingCompany.id },
          });

          if (!companySettings) {
            console.log('[Fidelity] ℹ️ Création des paramètres de fidélité par défaut');
            companySettings = await this.companySettingsRepo.create({
              companyId: shippingCompany.id,
              enableLoyaltyFees: true,
              loyaltyFeeFixed: 5.00,
            });
            await this.companySettingsRepo.save(companySettings);
          }

          console.log('[Fidelity] 🔍 Paramètres de fidélité:', {
            enableLoyaltyFees: companySettings?.enableLoyaltyFees,
            loyaltyFeeFixed: companySettings?.loyaltyFeeFixed,
          });

          if (companySettings && companySettings.enableLoyaltyFees) {
            const feePercentage = companySettings.loyaltyFeeFixed || 0;
            loyaltyFee = (amount * feePercentage) / 100;
            loyaltyFee = Math.round(loyaltyFee * 100) / 100;

            console.log('[Fidelity] 🔍 Calcul des frais de fidélité:', {
              montantTotal: amount,
              pourcentage: feePercentage,
              fraisFidelite: loyaltyFee,
            });

            if (loyaltyFee > 0) {
              const recipientUser = userLoyalty.user;

              console.log('[Fidelity] 🔍 Destinataire (Client):', {
                id: recipientUser?.id,
                fullName: recipientUser?.fullName,
                phone: recipientUser?.phone,
                userIdFpay: recipientUser?.userIdFpay,
              });

              if (recipientUser?.userIdFpay) {
                const fpayData = {
                  userId: recipientUser.userIdFpay,
                  amount: loyaltyFee,
                  description: `Frais de fidélité pour le colis ${shipment.trackingNumber}`,
                  currency: 'USD',
                  countryCode: 'CD',
                };

                console.log('[Fidelity] 📤 Envoi FPAY:', fpayData);

                const fpayResponse = await this.fpayService.makeSend(fpayData, userActive);

                console.log('[Fidelity] 📥 Réponse FPAY:', fpayResponse?.data?.transaction?.status);

                if (fpayResponse?.data?.transaction?.status === 'SUCCESS') {
                  const loyaltyHistory = this.loyaltyHistoryRepo.create({
                    userId: recipientUser.id,
                    loyaltyId: userLoyalty.id,
                    points: Math.round(loyaltyFee * 100),
                    pointsBefore: userLoyalty.pointsBalance,
                    pointsAfter: userLoyalty.pointsBalance + Math.round(loyaltyFee * 100),
                    transactionType: LoyaltyTransactionType.EARN,
                    sourceType: LoyaltySourceType.SHIPMENT,
                    sourceId: shipment.id,
                    description: `Frais de fidélité pour l'expédition ${shipment.trackingNumber}`,
                    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                    isExpired: false,
                  });
                  await this.loyaltyHistoryRepo.save(loyaltyHistory);

                  console.log(`[Fidelity] ✅ ${loyaltyFee} USD envoyé en fidélité pour le client ${recipientUser.id}`);
                  console.log(`[Fidelity] ✅ Points ajoutés: ${Math.round(loyaltyFee * 100)} points`);
                }
              } else {
                console.warn('[Fidelity] ⚠️ Destinataire sans userIdFpay');
              }
            } else {
              console.log('[Fidelity] ℹ️ Frais de fidélité = 0, pas d\'envoi');
            }
          } else {
            console.log('[Fidelity] ℹ️ Fidélité désactivée pour cette company');
          }
        } else {
          console.warn('[Fidelity] ⚠️ Aucune company trouvée');
        }
      } else {
        console.warn('[Fidelity] ⚠️ Aucun compte de fidélité trouvé pour le code:', loyaltyCode);
      }
    } else {
      console.log('[Fidelity] ℹ️ Aucun code de fidélité dans le shipment');
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
      clientPhone: shipment.clientPhone || shipment.user?.phone || 'Non renseigné',
      trackingNumber: shipment.trackingNumber,
      email: shipment.user?.email || 'Non renseigné',
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