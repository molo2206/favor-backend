/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateCompanyDto } from './dto/create-company.dto';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { CompanyEntity, CompanyPlatform, FeeBasis, FeeType } from './entities/company.entity';
import { DataSource, In, Repository } from 'typeorm';
import { UserHasCompanyEntity } from 'src/user_has_company/entities/user_has_company.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { RoleUser } from 'src/role_user/entities/role_user.entity';
import { CreateUserHasCompanyDto } from 'src/user_has_company/dto/create-user_has_company.dto';
import { instanceToPlain } from 'class-transformer';
import { TypeCompany } from 'src/type_company/entities/type_company.entity';
import { CompanyType } from 'src/company/enum/type.company.enum';
import { UpdateCompanyStatusDto } from './dto/update-company-status.dto';
import { MailService } from 'src/email/email.service';
import { CompanyStatus } from 'src/company/enum/company-status.enum';
import { TauxCompany } from 'src/taux-company/entities/taux-company.entity';
import { Product } from 'src/products/entities/product.entity';
import { Service } from 'src/service/entities/service.entity';
import { OrderEntity } from 'src/order/entities/order.entity';
import { OrderStatus } from 'src/order/enum/order.status.enum';
import { Between } from 'typeorm';
import { startOfDay, endOfDay, parseISO } from 'date-fns';
import { Country } from './entities/country.entity';
import { City } from './entities/city.entity';
import { CreateCountryDto } from './dto/create-country.dto';
import { CreateCityDto } from './dto/create-city.dto';
import { SmsService } from 'src/users/utility/sms/sms.service';
import { SmsQuotaService } from 'src/users/utility/sms/sms-quota.service';
import { SmsCategory } from 'src/users/utility/sms/entity/sms-recharge.entity';
import { SmsLogStatus } from 'src/users/utility/sms/entity/sms-log.entity';
import {
  CreateCompanyAdminDto,
  ResourcePermissionDto,
} from './dto/create-company-admin.dto';
import { UserPlatformRoleEntity } from 'src/users/entities/user_plateform_roles.entity';
import { NotificationsService } from 'src/notification/notifications.service';
import { UserRole } from 'src/users/enum/user-role-enum';
import { CategoryEntity } from 'src/category/entities/category.entity';
import { OrderItemEntity } from 'src/order-item/entities/order-item.entity';
import {
  AssignmentPermission,
  AssignmentResult,
  PermissionResponseDto,
  SetUserCompanyPermissionsDto,
  SetUserCompanyPermissionsResponseDto,
} from './dto/setUserCompanyPermissions.dto';
import { CompanyHasUserResource } from 'src/company_has_usrResource/entities/company_has_userResource.entity';
import { CompanyHasResourceEntity } from 'src/company_has_usrResource/entities/company_has_Resource.entity';
import { v4 as uuidv4 } from 'uuid';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { FilesService } from 'src/files/files.service';
import { AssignUserToCompanyDto } from './dto/assign-user-to-company.dto';
import { Resource } from 'src/ressource/entity/resource.entity';
import { LtaEntity } from 'src/shipment/Lta/entity/lta.entity';
import { Shipment } from 'src/shipment/entity/shipment.entity';
import { CompanyHasPartnerEntity } from './entities/company_has_partner.entity';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { CompanyActivity } from './enum/activity.company.enum';
import { I18nService } from 'src/libs/common/src';
import { PushNotificationHelper } from 'src/users/utility/helpers/push-notification.helper';
import { CompanySettingsEntity } from './entities/company-settings.entity';
import { CreateCompanySettingsDto, UpdateCompanySettingsDto } from './dto/create-company-settings.dto';
import { UpdateCityDto } from './dto/update-city.dto';
import { InvoiceConfigurationEntity } from './entities/invoice-configuration.entity';
import {
  CreateInvoiceConfigurationDto,
  UpdateInvoiceConfigurationDto,
} from './dto/invoice-configuration.dto';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';

@Injectable()
export class CompanyService {
  constructor(
    @InjectRepository(CompanyEntity)
    private readonly companyRepository: Repository<CompanyEntity>,
    @InjectRepository(UserHasCompanyEntity)
    private readonly userHasCompanyRepository: Repository<UserHasCompanyEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(RoleUser)
    private roleRepository: Repository<RoleUser>,
    @InjectRepository(CategoryEntity)
    private categoryRepository: Repository<CategoryEntity>,
    @InjectRepository(TypeCompany)
    private readonly typeCompanyRepository: Repository<TypeCompany>,
    @InjectRepository(TauxCompany)
    private readonly tauxCompanyRepository: Repository<TauxCompany>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(Service)
    private readonly serviceRepo: Repository<Service>,
    @InjectRepository(OrderEntity)
    private readonly orderRepo: Repository<OrderEntity>,
    @InjectRepository(OrderItemEntity)
    private readonly orderItemRepo: Repository<OrderItemEntity>,
    @InjectRepository(Country)
    private countryRepo: Repository<Country>,
    @InjectRepository(City)
    private cityRepo: Repository<City>,
    @InjectRepository(UserPlatformRoleEntity)
    private readonly userPlatformRoleRepo: Repository<UserPlatformRoleEntity>,
    private readonly notificationsService: NotificationsService,
    private readonly mailService: MailService,
    private readonly smsService: SmsService,
    private readonly smsQuotaService: SmsQuotaService,
    @InjectRepository(CompanyHasUserResource)
    private readonly companyUserResourceRepo: Repository<CompanyHasUserResource>,
    @InjectRepository(CompanyHasResourceEntity)
    private readonly companyHasResourceRepo: Repository<CompanyHasResourceEntity>,
    @InjectRepository(BranchEntity)
    private readonly branchRepo: Repository<BranchEntity>,
    private readonly filesService: FilesService,
    @InjectRepository(Resource)
    private readonly resourceRepo: Repository<Resource>,
    @InjectRepository(LtaEntity)
    private readonly ltaRepository: Repository<LtaEntity>,
    @InjectRepository(Shipment)
    private readonly shipmentRepo: Repository<Shipment>,
    @InjectRepository(CompanyHasPartnerEntity)
    private readonly partnerRepo: Repository<CompanyHasPartnerEntity>,
    @InjectDataSource()
    private dataSource: DataSource,
    private readonly i18n: I18nService,
    @InjectRepository(CompanySettingsEntity)
    private readonly companySettingsRepository: Repository<CompanySettingsEntity>,

    private pushNotificationHelper: PushNotificationHelper,

    @InjectRepository(InvoiceConfigurationEntity)
    private readonly invoiceConfigRepo: Repository<InvoiceConfigurationEntity>,


  ) { }

  // ======================== CREATE COMPANY WITH USER ========================

  async createCompanyWithUser(
    dto: CreateCompanyDto,
    user: UserEntity,
    lang: string = 'fr',
    logoFile?: Express.Multer.File,
    bannerFile?: Express.Multer.File,
  ): Promise<{ message: string; data: any }> {
    // ========== VALIDATIONS ==========
    if (!dto || Object.keys(dto).length === 0) {
      throw new BadRequestException(
        await this.i18n.translate('company_data_required', lang),
      );
    }
    if (!dto.companyName || dto.companyName.trim() === '') {
      throw new BadRequestException(
        await this.i18n.translate('company_name_required', lang),
      );
    }

    // ========== GESTION DES FICHIERS ==========
    let logoUrl: string | null = null;
    let bannerUrl: string | null = null;

    if (logoFile) {
      const uploadResult = await this.filesService.uploadFile(
        logoFile,
        'company/logo',
        'default',
      );
      logoUrl = uploadResult.data as string;
    }
    if (bannerFile) {
      const uploadResult = await this.filesService.uploadFile(
        bannerFile,
        'company/banner',
        'banner',
      );
      bannerUrl = uploadResult.data as string;
    }

    // ========== CRÉATION DE LA SOCIÉTÉ ==========
    const company = this.companyRepository.create({
      companyName: dto.companyName,
      companyAddress: dto.companyAddress,
      vatNumber: dto.vatNumber,
      registrationDocumentUrl: dto.registrationDocumentUrl,
      warehouseLocation: dto.warehouseLocation,
      logo: logoUrl,
      banner: bannerUrl,
      typeCompany: dto.typeCompany!,
      phone: dto.phone ?? user.phone ?? 'non renseigné',
      taux: dto.taux ?? 0,
      localCurrency: dto.localCurrency ?? 'USD',
      companyActivity: dto.companyActivity ?? CompanyActivity.RETAILER,
      email: dto.email,
      website: dto.website,
      open_time: dto.open_time,
      delivery_minutes: dto.delivery_minutes,
      distance_km: dto.distance_km,
      latitude: dto.latitude,
      longitude: dto.longitude,
      address: dto.address,
      country: dto.countryId ? ({ id: dto.countryId } as any) : null,
      city: dto.cityId ? ({ id: dto.cityId } as any) : null,
      category: dto.categoryId ? ({ id: dto.categoryId } as any) : null,
      categoryId: dto.categoryId ?? null,
      fee: dto.fee ?? 0,
      feeType: dto.feeType ?? FeeType.FIXED,
      feeB: dto.feeB ?? FeeBasis.SHIPMENT,
      isMain: dto.isMain,
      typePlatform: dto.typePlatform ?? CompanyPlatform.FAVOR_HELP,
    });

    const savedCompany = await this.companyRepository.save(company);

    // ========== LIEN UTILISATEUR ↔ SOCIÉTÉ ==========
    const userHasCompany = this.userHasCompanyRepository.create({
      user,
      company: savedCompany,
      isOwner: true,
    });
    await this.userHasCompanyRepository.save(userHasCompany);

    user.activeCompany = savedCompany;
    user.activeCompanyId = savedCompany.id;
    await this.userRepository.save(user);

    // ========== BRANCHE PRINCIPALE ==========
    const branch = this.branchRepo.create({
      name: `${savedCompany.companyName} (Branche principale)`,
      address: savedCompany.companyAddress,
      phone: savedCompany.phone,
      email: savedCompany.email,
      company_id: savedCompany.id,
    });
    await this.branchRepo.save(branch);
    userHasCompany.branchId = branch.id;
    await this.userHasCompanyRepository.save(userHasCompany); // ✅ branche enregistrée

    // ========== PERMISSIONS DU PROPRIÉTAIRE ==========
    // ✅ Le créateur de l'entreprise reçoit immédiatement ses permissions
    //    (company_has_resource + company_has_user_resource), tous droits.
    await this.grantInitialOwnerPermissions(user, savedCompany, branch.id, lang);

    // ========== RECHARGER L'UTILISATEUR COMPLET ==========
    const fullUser = await this.userRepository.findOne({
      where: { id: user.id },
      relations: [
        'activeCompany',
        'activeCompany.country',
        'activeCompany.city',
        'userHasCompany.company',
      ],
    });

    // ========== TAUX PAR DÉFAUT ==========
    const defaultTaux = this.tauxCompanyRepository.create({
      name: 'Taux initial de la société',
      value: dto.taux || 0,
      currency: 'CDF',
      isActive: true,
      company: savedCompany,
    });
    await this.tauxCompanyRepository.save(defaultTaux);

    // ========== ENVOI D'EMAIL ET SMS ==========
    const hasEmail = !!user.email && user.email.includes('@');
    const hasPhone = !!user.phone;
    const message = await this.i18n.translate('company_created_sms', lang, {
      fullName: user.fullName,
      companyName: savedCompany.companyName,
    });

    if (hasEmail) {
      try {
        // Construction des traductions avec les clés underscore
        const translations = {
          title: await this.i18n.translate(
            'company_email_status_title',
            lang,
          ),

          headerTitle: await this.i18n.translate(
            'company_email_header_title',
            lang,
          ),

          description: await this.i18n.translate(
            'company_email_description',
            lang,
          ),

          supportText: await this.i18n.translate(
            'company_email_support_text',
            lang,
          ),

          contactUs: await this.i18n.translate(
            'company_email_contact_us',
            lang,
          ),

          footerCopyright: await this.i18n.translate(
            'company_email_footer_copyright',
            lang,
          ),

          legalNote: await this.i18n.translate(
            'company_email_legal_note',
            lang,
          ),
        };
        // Statut de la société (dans cette méthode, la société est créée en statut "PENDING")

        const statusText = await this.i18n.translate(
          'company.company_status_pending',
          lang,
        );
        await this.mailService.sendHtmlEmail(
          user.email,
          await this.i18n.translate(
            'company_validation_email_subject',
            lang,
          ),
          'company-status-update.html',
          {
            companyName: savedCompany.companyName,
            status: statusText,
            year: new Date().getFullYear(),
            translations,
            lang,
          },
        );
      } catch (error) {
        console.error(`❌ Erreur lors de l’envoi d’email à ${user.email}:`, error);
      }
    }

    if (hasPhone) {
      void this.safeSendCompanySms(user.phone, message, 'COMPANY_CREATED', savedCompany.id); // ✅ sans await : n'attend pas et ne bloque jamais le traitement
    }

    // ========== NOTIFICATIONS AUX ADMINS ET PLATEFORMES ==========
    const platformUsers = await this.userPlatformRoleRepo.find({
      where: { platform: { key: savedCompany.typeCompany } },
      relations: ['user'],
    });
    const superAdmins = await this.userRepository.find({
      where: { role: UserRole.SUPER_ADMIN },
    });
    const allRecipients = [
      ...platformUsers.map((p) => p.user),
      ...superAdmins,
    ].filter(
      (usr, index, self) => index === self.findIndex((u) => u.id === usr.id),
    );

    for (const recipient of allRecipients) {
      await this.notificationsService.sendNotificationToUser(
        recipient.id,
        await this.i18n.translate('company_created', lang),
        `Une nouvelle entreprise (${savedCompany.companyName ?? savedCompany.id}) vient d’être enregistrée.`,
        'COMPANY' as any,
        savedCompany,
      );
    }

    // ========== RETOUR ==========
    return {
      message: await this.i18n.translate('company_created', lang),
      data: fullUser!,
    };
  }
  // ======================== UPDATE COMPANY WITH USER ========================
  async updateCompanyWithUser(
    dto: Partial<CreateCompanyDto>,
    current_user: UserEntity,
    lang: string = 'fr',
    logoFile?: Express.Multer.File,
    bannerFile?: Express.Multer.File,
  ): Promise<{ message: string; data: CompanyEntity }> {
    if (!dto || Object.keys(dto).length === 0) {
      throw new BadRequestException(
        await this.i18n.translate('company_data_required', lang),
      );
    }

    const company = await this.companyRepository.findOne({
      where: { id: current_user.activeCompanyId },
      relations: ['country', 'city'],
    });

    if (!company) {
      throw new NotFoundException(
        await this.i18n.translate('company_not_found', lang),
      );
    }

    const fieldsToUpdate: (keyof CreateCompanyDto)[] = [
      'companyName',
      'companyAddress',
      'vatNumber',
      'registrationDocumentUrl',
      'warehouseLocation',
      'phone',
      'email',
      'website',
      'banner',
      'open_time',
      'delivery_minutes',
      'distance_km',
      'companyActivity',
      'latitude',
      'longitude',
      'address',
      'localCurrency',
      'taux',
      'typeCompany',
      'countryId',
      'cityId',
      'categoryId',
      // 'fee',
      // 'feeType',
      // 'feeB',
      // 'isMain',
    ];

    for (const field of fieldsToUpdate) {
      const value = dto[field];
      if (value !== undefined && value !== null && value !== '') {
        (company as any)[field] = value;
      }
    }

    if (dto.taux !== undefined) {
      const taux = Number(dto.taux);
      if (!isNaN(taux)) company.taux = taux;
    }
    if (dto.localCurrency !== undefined) {
      company.localCurrency = dto.localCurrency;
    }

    if (logoFile) {
      const uploadResult = await this.filesService.uploadFile(
        logoFile,
        'company/logo',
        'default',
      );
      company.logo = uploadResult.data as string;
    } else if (dto.logo) {
      company.logo = dto.logo;
    }
    if (bannerFile) {
      const uploadResult = await this.filesService.uploadFile(
        bannerFile,
        'company/banner',
        'banner',
      );
      company.banner = uploadResult.data as string;
    } else if (dto.banner) {
      company.banner = dto.banner;
    }

    if (
      dto.typeCompany &&
      Object.values(CompanyType).includes(dto.typeCompany as CompanyType)
    ) {
      company.typeCompany = dto.typeCompany as CompanyType;
    }
    if (dto.countryId) {
      company.country = { id: dto.countryId } as any;
    }
    if (dto.cityId) {
      company.city = { id: dto.cityId } as any;
    }

    if (dto.typePlatform) {
      company.typePlatform = { typePlatform: dto.typePlatform } as any;
    }

    if (dto.categoryId) {
      company.category = { id: dto.categoryId } as any;
      company.categoryId = dto.categoryId;
    }

    await this.companyRepository.save(company);

    const updatedCompany = await this.companyRepository.findOne({
      where: { id: company.id },
      relations: [
        'country',
        'city',
        'products',
        'userHasCompany',
        'userHasCompany.user',
        'userHasCompany.role',
        'services',
        'rooms',
        'tauxCompanies',
        'measures',
        'branches',
        // 'fee',
        // 'feeType',
        // 'feeB',
        // 'isMain',
      ],
    });

    if (!updatedCompany) {
      throw new NotFoundException(
        await this.i18n.translate('company_not_found', lang),
      );
    }
    return {
      message: await this.i18n.translate('company_updated', lang),
      data: updatedCompany,
    };
  }

  // ======================== CREATE COMPANY WITH USER ADMIN ========================
  async createCompanyWithUserAdmin(
    dto: CreateCompanyAdminDto,
    lang: string = 'fr',
    logoFile?: Express.Multer.File,
    bannerFile?: Express.Multer.File,
  ): Promise<{ message: string; data: any }> {
    // ========== VALIDATIONS ==========
    if (!dto || Object.keys(dto).length === 0) {
      throw new BadRequestException(
        await this.i18n.translate('company_data_required', lang),
      );
    }
    if (!dto.companyName || dto.companyName.trim() === '') {
      throw new BadRequestException(
        await this.i18n.translate('company_name_required', lang),
      );
    }

    // ========== GESTION DES FICHIERS ==========
    let logoUrl: string | null = null;
    let bannerUrl: string | null = null;

    if (logoFile) {
      const uploadResult = await this.filesService.uploadFile(
        logoFile,
        'company/logo',
        'default',
      );
      logoUrl = uploadResult.data as string;
    }
    if (bannerFile) {
      const uploadResult = await this.filesService.uploadFile(
        bannerFile,
        'company/banner',
        'banner',
      );
      bannerUrl = uploadResult.data as string;
    }

    // ========== RECHERCHE DE L'UTILISATEUR ==========
    const user = await this.userRepository.findOne({
      where: { id: dto.userId },
    });
    if (!user) throw new NotFoundException(await this.i18n.translate('company_not_found', lang));

    // ========== VÉRIFICATION DOUBLON ==========
    const existing = await this.companyRepository.findOne({
      where: { companyName: dto.companyName },
    });
    if (existing) throw new ConflictException(await this.i18n.translate('company_already_exists', lang));

    // ========== CRÉATION DE LA SOCIÉTÉ ==========
    const company = this.companyRepository.create({
      companyName: dto.companyName,
      companyAddress: dto.companyAddress,
      vatNumber: dto.vatNumber,
      registrationDocumentUrl: dto.registrationDocumentUrl,
      warehouseLocation: dto.warehouseLocation,
      logo: logoUrl,
      banner: bannerUrl,
      typeCompany: dto.typeCompany!,
      phone: dto.phone,
      email: dto.email,
      website: dto.website,
      companyActivity: dto.companyActivity,
      open_time: dto.open_time,
      delivery_minutes: dto.delivery_minutes,
      distance_km: dto.distance_km,
      latitude: dto.latitude,
      longitude: dto.longitude,
      address: dto.address,
      taux: dto.taux || 0,
      localCurrency: dto.localCurrency,
      country: dto.countryId ? ({ id: dto.countryId } as any) : null,
      city: dto.cityId ? ({ id: dto.cityId } as any) : null,
      category: dto.categoryId ? ({ id: dto.categoryId } as any) : null,
      categoryId: dto.categoryId ?? null,
      status: CompanyStatus.VALIDATED,
      fee: dto.fee ?? 0,
      feeType: dto.feeType ?? FeeType.FIXED,
      feeB: dto.feeB ?? FeeBasis.SHIPMENT,
      isMain: dto.isMain,
    });

    const savedCompany = await this.companyRepository.save(company);

    // ========== LIEN UTILISATEUR ↔ SOCIÉTÉ ==========
    const userHasCompany = this.userHasCompanyRepository.create({
      user: { id: user.id } as any,
      company: savedCompany,
      isOwner: true,
    });
    await this.userHasCompanyRepository.save(userHasCompany);

    user.activeCompany = savedCompany;
    user.activeCompanyId = savedCompany.id;
    await this.userRepository.save(user);

    // ========== TAUX PAR DÉFAUT ==========
    const defaultTaux = this.tauxCompanyRepository.create({
      name: 'Taux initial de la société',
      value: dto.taux || 0,
      currency: 'CDF',
      isActive: true,
      company: savedCompany,
    });
    await this.tauxCompanyRepository.save(defaultTaux);

    // ========== BRANCHE PRINCIPALE ==========
    const branch = this.branchRepo.create({
      name: `${savedCompany.companyName} (Branche principale)`,
      address: savedCompany.companyAddress,
      phone: savedCompany.phone,
      email: savedCompany.email,
      company_id: savedCompany.id,
    });
    await this.branchRepo.save(branch);

    userHasCompany.branchId = branch.id;
    await this.userHasCompanyRepository.save(userHasCompany);

    // ========== PERMISSIONS GLOBALES (SOCIÉTÉ) ==========
    const resources = dto.resources;
    if (resources && resources.length > 0) {
      for (const perm of resources) {
        const existingGlobal = await this.companyHasResourceRepo.findOne({
          where: { companyId: savedCompany.id, resourceId: perm.resourceId },
        });
        if (existingGlobal) {
          existingGlobal.can_create = perm.canCreate ?? existingGlobal.can_create;
          existingGlobal.can_read = perm.canRead ?? existingGlobal.can_read;
          existingGlobal.can_update = perm.canUpdate ?? existingGlobal.can_update;
          existingGlobal.can_delete = perm.canDelete ?? existingGlobal.can_delete;
          existingGlobal.can_manage = perm.canManage ?? existingGlobal.can_manage;
          existingGlobal.status = perm.status ?? existingGlobal.status;
          await this.companyHasResourceRepo.save(existingGlobal);
        } else {
          const newGlobalPerm = this.companyHasResourceRepo.create({
            id: uuidv4(),
            companyId: savedCompany.id,
            resourceId: perm.resourceId,
            can_create: perm.canCreate ?? false,
            can_read: perm.canRead ?? false,
            can_update: perm.canUpdate ?? false,
            can_delete: perm.canDelete ?? false,
            can_manage: perm.canManage ?? false,
            status: perm.status ?? true,
          });
          await this.companyHasResourceRepo.save(newGlobalPerm);
        }
      }
    }

    // ========== PERMISSIONS UTILISATEUR (pour cette société) ==========
    if (resources && resources.length > 0) {
      for (const perm of resources) {
        const existingUserPerm = await this.companyUserResourceRepo.findOne({
          where: {
            userCompanyId: userHasCompany.id,
            resourceId: perm.resourceId,
            branchId: branch.id,
          },
        });
        if (existingUserPerm) {
          existingUserPerm.canCreate = perm.canCreate ?? existingUserPerm.canCreate;
          existingUserPerm.canRead = perm.canRead ?? existingUserPerm.canRead;
          existingUserPerm.canUpdate = perm.canUpdate ?? existingUserPerm.canUpdate;
          existingUserPerm.canDelete = perm.canDelete ?? existingUserPerm.canDelete;
          existingUserPerm.canManage = perm.canManage ?? existingUserPerm.canManage;
          existingUserPerm.status = perm.status ?? existingUserPerm.status;
          await this.companyUserResourceRepo.save(existingUserPerm);
        } else {
          const newUserPerm = this.companyUserResourceRepo.create({
            id: uuidv4(),
            userCompanyId: userHasCompany.id,
            resourceId: perm.resourceId,
            branchId: branch.id,
            canCreate: perm.canCreate ?? false,
            canRead: perm.canRead ?? false,
            canUpdate: perm.canUpdate ?? false,
            canDelete: perm.canDelete ?? false,
            canManage: perm.canManage ?? false,
            status: perm.status ?? true,
          });
          await this.companyUserResourceRepo.save(newUserPerm);
        }
      }
    } else {
      // ✅ Aucune ressource envoyée : le propriétaire reçoit quand même ses permissions
      await this.grantInitialOwnerPermissions(user, savedCompany, branch.id, lang);
    }

    // ========== ENVOI D'EMAIL ET SMS ==========
    const hasEmail = !!user.email;
    const hasPhone = !!user.phone;

    // if (hasEmail) {
    //   // Construction des traductions avec les clés underscore
    //   const translations = {
    //     title: await this.i18n.translate('company_email_status_title', lang),
    //     headerTitle: await this.i18n.translate('company_email_header_title', lang), // ← headerTitle
    //     description: await this.i18n.translate('company_email_description', lang),
    //     supportText: await this.i18n.translate('company_email_support_text', lang),
    //     contactUs: await this.i18n.translate('company_email_contact_us', lang),
    //     footerCopyright: await this.i18n.translate('company_email_footer_copyright', lang), // ← footerCopyright
    //     legalNote: await this.i18n.translate('company_email_legal_note', lang),
    //   };
    //   // Traduction du statut (VALIDATED -> company_status_approved)
    //   const statusText = await this.i18n.translate('company_status_approved', lang);

    //   await this.mailService.sendHtmlEmail(
    //     user.email,
    //     await this.i18n.translate('company_validation_email_subject', lang),
    //     'company-status-update.html',
    //     {
    //       companyName: savedCompany.companyName,
    //       status: statusText,
    //       year: new Date().getFullYear(),
    //       translations,
    //       lang,
    //     },
    //   );
    // }

    if (hasPhone) {
      const message = await this.i18n.translate('company_created_sms', lang, {
        fullName: user.fullName,
        companyName: savedCompany.companyName,
      });
      void this.safeSendCompanySms(user.phone, message, 'COMPANY_CREATED_ADMIN', savedCompany.id); // ✅ sans await : n'attend pas et ne bloque jamais le traitement
    }

    // ========== RETOUR ==========
    return {
      message: await this.i18n.translate('company_created', lang),
      data: null,
    };
  }
  // ======================== UPDATE COMPANY WITH USER ADMIN ========================
  async updateCompanyWithUserAdmin(
    id: string,
    dto: Partial<CreateCompanyAdminDto>,
    lang: string = 'fr',
    logoFile?: Express.Multer.File,
    bannerFile?: Express.Multer.File,
    currentUser?: UserEntity,                    // ✅ AJOUT
  ): Promise<{ message: string; data: any }> {
    if (!dto || Object.keys(dto).length === 0) {
      throw new BadRequestException(
        await this.i18n.translate('company_data_required', lang),
      );
    }

    // ============================================================
    // ✅ MODIFIÉ : fallback sur l'utilisateur connecté
    // ============================================================
    const resolvedUserId = dto.userId || currentUser?.id;

    if (!resolvedUserId) {
      throw new BadRequestException(
        await this.i18n.translate('company_user_not_linked', lang),
      );
    }

    const user = await this.userRepository.findOne({
      where: { id: resolvedUserId },
    });
    if (!user) {
      throw new NotFoundException(
        await this.i18n.translate('user.user_not_found', lang),
      );
    }

    // ✅ Injecter dans dto pour que le reste du code fonctionne
    if (!dto.userId) {
      dto.userId = resolvedUserId;
      console.log(
        `ℹ️ [updateCompanyWithUserAdmin] userId non fourni → utilisation de l'utilisateur connecté : ${resolvedUserId}`,
      );
    }

    let company = await this.companyRepository.findOne({
      where: { id },
      relations: ['country', 'city', 'category'],
    });
    if (!company) {
      throw new NotFoundException(
        await this.i18n.translate('company_not_found', lang),
      );
    }

    const fieldsToUpdate: (keyof CreateCompanyAdminDto)[] = [
      'companyName',
      'companyAddress',
      'vatNumber',
      'registrationDocumentUrl',
      'warehouseLocation',
      'phone',
      'email',
      'website',
      'banner',
      'open_time',
      'delivery_minutes',
      'distance_km',
      'companyActivity',
      'latitude',
      'longitude',
      'address',
      'localCurrency',
      'taux',
      'typeCompany',
      'countryId',
      'cityId',
      'categoryId',
      'fee',
      'feeType',
      'feeB',
      'isMain',
    ];

    for (const field of fieldsToUpdate) {
      const value = dto[field];
      if (value !== undefined && value !== null && value !== '') {
        (company as any)[field] = value;
      }
    }

    if (dto.taux !== undefined) {
      const taux = Number(dto.taux);
      if (!isNaN(taux)) company.taux = taux;
    }
    if (dto.localCurrency !== undefined) {
      company.localCurrency = dto.localCurrency;
    }

    if (logoFile) {
      const uploadResult = await this.filesService.uploadFile(
        logoFile,
        'company/logo',
        'default',
      );
      company.logo = uploadResult.data as string;
    } else if (dto.logo !== undefined) {
      company.logo = dto.logo;
    }
    if (bannerFile) {
      const uploadResult = await this.filesService.uploadFile(
        bannerFile,
        'company/banner',
        'banner',
      );
      company.banner = uploadResult.data as string;
    } else if (dto.banner !== undefined) {
      company.banner = dto.banner;
    }

    if (
      dto.typeCompany &&
      Object.values(CompanyType).includes(dto.typeCompany as CompanyType)
    ) {
      company.typeCompany = dto.typeCompany as CompanyType;
    }
    if (dto.countryId) company.country = { id: dto.countryId } as any;
    if (dto.cityId) company.city = { id: dto.cityId } as any;
    if (dto.categoryId !== undefined) {
      if (dto.categoryId === null) {
        company.category = null;
        company.categoryId = null;
      } else {
        company.category = { id: dto.categoryId } as any;
        company.categoryId = dto.categoryId;
      }
    }

    await this.companyRepository.save(company);

    // ============================================================
    // ✅ dto.userId est maintenant TOUJOURS rempli
    // ============================================================
    const userHasCompany = await this.userHasCompanyRepository.findOne({
      where: { user: { id: dto.userId }, company: { id: company.id } },
    });
    if (!userHasCompany) {
      throw new NotFoundException(
        await this.i18n.translate('company_user_not_linked', lang),
      );
    }

    if (dto.branchId) {
      const newBranch = await this.branchRepo.findOne({
        where: { id: dto.branchId, company_id: company.id },
      });
      if (!newBranch) {
        throw new BadRequestException(
          await this.i18n.translate('company_invalid_branch', lang),
        );
      }
      if (userHasCompany.branchId !== newBranch.id) {
        userHasCompany.branchId = newBranch.id;
        await this.userHasCompanyRepository.save(userHasCompany);
      }
    }

    let resources = dto.resources;
    if (typeof resources === 'string') {
      try {
        resources = JSON.parse(resources);
      } catch (error) {
        resources = [];
        console.warn('Invalid resources JSON string, using empty array');
      }
    }
    if (!Array.isArray(resources)) {
      resources = [];
    }

    if (resources.length > 0) {
      for (const perm of resources) {
        const existingGlobal = await this.companyHasResourceRepo.findOne({
          where: { companyId: company.id, resourceId: perm.resourceId },
        });
        if (existingGlobal) {
          existingGlobal.can_create =
            perm.canCreate ?? existingGlobal.can_create;
          existingGlobal.can_read = perm.canRead ?? existingGlobal.can_read;
          existingGlobal.can_update =
            perm.canUpdate ?? existingGlobal.can_update;
          existingGlobal.can_delete =
            perm.canDelete ?? existingGlobal.can_delete;
          existingGlobal.can_manage =
            perm.canManage ?? existingGlobal.can_manage;
          existingGlobal.status = perm.status ?? existingGlobal.status;
          await this.companyHasResourceRepo.save(existingGlobal);
        } else {
          const newGlobal = this.companyHasResourceRepo.create({
            id: uuidv4(),
            companyId: company.id,
            resourceId: perm.resourceId,
            can_create: perm.canCreate ?? false,
            can_read: perm.canRead ?? false,
            can_update: perm.canUpdate ?? false,
            can_delete: perm.canDelete ?? false,
            can_manage: perm.canManage ?? false,
            status: perm.status ?? true,
          });
          await this.companyHasResourceRepo.save(newGlobal);
        }
      }
      const newResourceIds = resources.map((r) => r.resourceId);
      await this.companyHasResourceRepo
        .createQueryBuilder()
        .delete()
        .where('companyId = :companyId', { companyId: company.id })
        .andWhere('resourceId NOT IN (:...newResourceIds)', { newResourceIds })
        .execute();
    } else if (dto.resources !== undefined) {
      await this.companyHasResourceRepo.delete({ companyId: company.id });
    }

    const updatedGlobalResources = await this.companyHasResourceRepo.find({
      where: { companyId: company.id },
      select: [
        'resourceId',
        'can_create',
        'can_read',
        'can_update',
        'can_delete',
        'can_manage',
        'status',
      ],
    });

    const allBranches = await this.branchRepo.find({
      where: { company_id: company.id },
    });

    const allUserHasCompanies = await this.userHasCompanyRepository.find({
      where: { company: { id: company.id } },
    });

    for (const branch of allBranches) {
      for (const uhc of allUserHasCompanies) {
        const existingPermissions = await this.companyUserResourceRepo.find({
          where: { userCompanyId: uhc.id, branchId: branch.id },
        });
        for (const userPerm of existingPermissions) {
          const globalPerm = updatedGlobalResources.find(
            (g) => g.resourceId === userPerm.resourceId,
          );
          if (globalPerm) {
            userPerm.canCreate = globalPerm.can_create;
            userPerm.canRead = globalPerm.can_read;
            userPerm.canUpdate = globalPerm.can_update;
            userPerm.canDelete = globalPerm.can_delete;
            userPerm.canManage = globalPerm.can_manage;
            userPerm.status = globalPerm.status;
            await this.companyUserResourceRepo.save(userPerm);
          } else {
            await this.companyUserResourceRepo.delete(userPerm.id);
          }
        }
      }
    }

    const fullCompany = await this.companyRepository
      .createQueryBuilder('company')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('company.city', 'city')
      .leftJoinAndSelect('company.category', 'category')
      .leftJoinAndSelect('company.tauxCompanies', 'tauxCompanies')
      .leftJoinAndSelect('company.companyResources', 'companyResources')
      .leftJoinAndSelect('companyResources.resource', 'resource')
      .leftJoinAndSelect('company.branches', 'branches')
      .leftJoinAndSelect('company.userHasCompany', 'userHasCompany')
      .leftJoinAndSelect('userHasCompany.user', 'user')
      .leftJoinAndSelect('userHasCompany.resources', 'userCompanyResources')
      .leftJoinAndSelect(
        'userCompanyResources.resource',
        'userCompanyResourceDetail',
      )
      .where('company.id = :id', { id: company.id })
      .getOne();

    if (!fullCompany) {
      throw new NotFoundException(
        await this.i18n.translate('company_not_found', lang),
      );
    }

    const companyResources =
      fullCompany.companyResources?.map((cr) => ({
        id: cr.id,
        canCreate: cr.can_create,
        canRead: cr.can_read,
        canUpdate: cr.can_update,
        canDelete: cr.can_delete,
        canManage: cr.can_manage,
        status: cr.status,
        resource: cr.resource
          ? {
            id: cr.resource.id,
            name: cr.resource.name,
            label: cr.resource.label,
          }
          : null,
      })) ?? [];

    const userCompanyRelation = fullCompany.userHasCompany?.find(
      (uhc) => uhc.user?.id === dto.userId,
    );
    const userResourcesForCompany =
      userCompanyRelation?.resources?.map((r) => ({
        id: r.id,
        canCreate: r.canCreate,
        canRead: r.canRead,
        canUpdate: r.canUpdate,
        canDelete: r.canDelete,
        canManage: r.canManage,
        status: r.status,
        resource: r.resource
          ? {
            id: r.resource.id,
            name: r.resource.name,
            label: r.resource.label,
          }
          : null,
      })) ?? [];

    const enrichedCompany = {
      ...fullCompany,
      tauxCompanies: fullCompany.tauxCompanies ?? [],
      country: fullCompany.country ?? null,
      city: fullCompany.city ?? null,
      category: fullCompany.category ?? null,
      companyResources,
      userResources: userResourcesForCompany,
      branches: (fullCompany.branches ?? []).map((b) => ({
        id: b.id,
        name: b.name,
        address: b.address,
        phone: b.phone,
        email: b.email,
        status: b.status,
        deleted: b.deleted,
        country: b.country ? { id: b.country.id, name: b.country.name } : null,
        city: b.city ? { id: b.city.id, name: b.city.name } : null,
      })),
    };

    return {
      message: await this.i18n.translate('company_updated', lang),
      data: instanceToPlain(enrichedCompany),
    };
  }

  // ======================== CREATE USER TO COMPANY ========================
  async CreateUserToCompany(
    dto: CreateUserHasCompanyDto,
    lang: string = 'fr',
  ): Promise<{ message: string; data: any }> {
    const user = await this.userRepository.findOne({ where: { id: dto.userId } });
    if (!user) {
      throw new NotFoundException(await this.i18n.translate('user_not_found', lang));
    }
    const company = await this.companyRepository.findOne({ where: { id: dto.companyId } });
    if (!company) {
      throw new NotFoundException(await this.i18n.translate('company_not_found', lang));
    }
    const role = await this.roleRepository.findOne({ where: { id: dto.roleId } });
    if (!role) {
      throw new NotFoundException(
        await this.i18n.translate('company_assignment.role_not_found', lang),
      );
    }

    // ✅ Affectation + permissions immédiates (par défaut : ressources de l'entreprise)
    const result = await this.applyCompanyAssignment({
      user,
      company,
      branchId: dto.branchId,
      permissions: dto.permissions,
      ceiling: 'company',
      isOwner: dto.isOwner,
      role,
      setActiveCompany: 'if-empty',
      lang,
    });

    const saved = await this.userHasCompanyRepository.findOne({
      where: { id: result.userCompanyId },
      relations: ['user', 'company', 'role', 'branch'],
    });
    const plain: any = instanceToPlain(saved ?? {});
    if (plain.user) {
      delete plain.user.password;
      delete plain.user.twoFASecret;
    }

    return {
      message: await this.assignmentMessage(result, lang),
      data: {
        ...plain,
        permissionsCount: result.permissions.length,
        permissions: result.permissions,
        wasAlreadyAssigned: result.wasAlreadyAssigned,
        defaultPermissionsApplied: result.defaultPermissionsApplied,
        permissionsKept: result.permissionsKept,
        ignoredResourceIds: result.ignoredResourceIds,
      },
    };
  }

  // ======================== UPDATE COMPANY STATUS ========================
  async updateCompanyStatus(
    id: string,
    dto: UpdateCompanyStatusDto,
    lang: string = 'fr',
  ): Promise<{ data: CompanyEntity; message: string }> {
    const company = await this.companyRepository.findOne({ where: { id } });
    if (!company) throw new NotFoundException(await this.i18n.translate('company_not_found', lang));

    const oldStatus = company.status;
    company.status = dto.status;
    const updatedCompany = await this.companyRepository.save(company);

    // Récupérer l'utilisateur propriétaire (ou l'admin principal) de l'entreprise
    const userHasCompany = await this.userHasCompanyRepository.findOne({
      where: { company: { id: company.id }, isOwner: true }, // ou tout autre critère
      relations: ['user'],
    });

    if (userHasCompany && userHasCompany.user) {
      const user = userHasCompany.user;

      // Traduire le message de notification
      const statusMessage = await this.i18n.translate('company_status_update_sms', lang, {
        companyName: company.companyName,
        status: company.status,
      });

      // 1. Envoyer une notification push (si l'utilisateur a des tokens)
      if (user.deviceTokens && user.deviceTokens.length > 0) {
        await this.pushNotificationHelper.sendAll({
          userId: user.id,
          pushTitle: await this.i18n.translate('company_status_update_title', lang),
          pushBody: statusMessage,
          pushData: {
            entity: 'COMPANY',
            entityId: company.id,
            action: 'STATUS_CHANGE',
            oldStatus,
            newStatus: company.status,
          },
        });
      }

      // 2. Envoyer un SMS (si l'utilisateur a un numéro de téléphone)
      if (user.phone && user.phone.trim()) {
        // ✅ Quota vérifié + envoi ; ne bloque jamais la mise à jour
        void this.safeSendCompanySms(user.phone, statusMessage, 'COMPANY_STATUS_CHANGE', company.id); // ✅ sans await : n'attend pas et ne bloque jamais le traitement
      }
    }

    return {
      message: await this.i18n.translate('company_status_updated', lang),
      data: updatedCompany,
    };
  }

  // ======================== SMS (QUOTA) ========================
  /**
   * ✅ Envoi SMS sécurisé pour l'entreprise (catégorie AUTH).
   * 1. Vérifie et décompte le quota (FIFO, transaction verrouillée)
   * 2. Envoie le SMS via SmsService
   * 3. Rembourse le quota si l'envoi échoue
   * 4. Journalise dans sms_logs
   * Ne lève JAMAIS d'erreur : retourne true si le SMS est parti, false sinon.
   * Quota à 0 → SMS ignoré (journalisé SKIPPED_NO_QUOTA), le traitement continue normalement.
   */
  private async safeSendCompanySms(
    phone: string | null | undefined,
    message: string,
    referenceType: string,
    referenceId?: string | number,
  ): Promise<boolean> {
    try {
      return await this.sendCompanySmsWithQuota(phone, message, referenceType, referenceId);
    } catch (error: any) {
      // ✅ Filet de sécurité : aucune erreur SMS ne remonte au traitement métier
      console.error(`[Company] Erreur SMS inattendue [${referenceType}]:`, error?.message);
      return false;
    }
  }

  private async sendCompanySmsWithQuota(
    phone: string | null | undefined,
    message: string,
    referenceType: string,
    referenceId?: string | number,
  ): Promise<boolean> {
    const category = SmsCategory.AUTH;
    const refId = referenceId !== undefined && referenceId !== null ? String(referenceId) : undefined;
    const recipient = (phone ?? '').trim();

    if (!recipient) {
      await this.writeSmsLog({
        category, recipient: '', message, status: SmsLogStatus.SKIPPED_NO_PHONE,
        quotaBefore: 0, quotaAfter: 0, referenceId: refId, referenceType,
      });
      return false;
    }

    // 1. Quota
    let quota: { allowed: boolean; quotaBefore: number; quotaAfter: number };
    try {
      quota = await this.smsQuotaService.tryConsume(category, 1);
    } catch (error: any) {
      console.error(`[Company] Erreur quota SMS [${referenceType}]:`, error?.message);
      return false;
    }

    if (!quota.allowed) {
      console.warn(
        `[Company] Quota SMS ${category} épuisé (restant: ${quota.quotaBefore}) -> SMS non envoyé [${referenceType}] -> ${recipient}`,
      );
      await this.writeSmsLog({
        category, recipient, message, status: SmsLogStatus.SKIPPED_NO_QUOTA,
        quotaBefore: quota.quotaBefore, quotaAfter: quota.quotaAfter,
        errorMessage: 'Quota SMS épuisé', referenceId: refId, referenceType,
      });
      return false;
    }

    // 2. Envoi
    let sent = false;
    let errorMessage: string | undefined;
    try {
      sent = await this.smsService.sendSms(recipient, message);
      if (!sent) errorMessage = 'Échec envoi fournisseur SMS';
    } catch (error: any) {
      errorMessage = error?.message ?? 'Erreur inconnue';
    }

    // 3. Remboursement si échec
    let quotaAfter = quota.quotaAfter;
    if (!sent) {
      try {
        await this.smsQuotaService.refund(category, 1);
        quotaAfter = quota.quotaBefore;
      } catch (error: any) {
        console.error(`[Company] Erreur remboursement quota SMS [${referenceType}]:`, error?.message);
      }
      console.warn(`[Company] SMS non envoyé [${referenceType}] -> ${recipient} : ${errorMessage}`);
    } else {
      console.log(
        `[Company] SMS envoyé [${referenceType}] -> ${recipient} (quota avant: ${quota.quotaBefore}, après: ${quota.quotaAfter})`,
      );
    }

    // 4. Journal
    await this.writeSmsLog({
      category, recipient, message,
      status: sent ? SmsLogStatus.SENT : SmsLogStatus.FAILED,
      quotaBefore: quota.quotaBefore, quotaAfter,
      errorMessage, referenceId: refId, referenceType,
    });

    return sent;
  }

  private async writeSmsLog(params: Parameters<SmsQuotaService['log']>[0]): Promise<void> {
    try {
      await this.smsQuotaService.log(params);
    } catch (error: any) {
      console.error('[Company] Erreur journal SMS:', error?.message);
    }
  }

  // ======================== FIND BY TYPE ========================
  async findByType(
    type?: string,
    search?: string,
    page: number = 1,
    limit: number = 10,
    lang: string = 'fr',
  ): Promise<{
    message: string;
    data: PaginatedResponseDto<CompanyEntity>;
  }> {
    // ============================================================
    // 1. Charger TOUTES les companies (sans pagination, sans filtre)
    // ============================================================
    const query = this.companyRepository
      .createQueryBuilder('company')
      .leftJoinAndSelect('company.userHasCompany', 'userHasCompany')
      .leftJoinAndSelect('userHasCompany.user', 'user')
      .leftJoinAndSelect('userHasCompany.role', 'role')
      .leftJoinAndSelect('company.companyResources', 'companyResources')
      .leftJoinAndSelect('companyResources.resource', 'resource')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('company.city', 'city')
      .leftJoinAndSelect('company.category', 'category')
      .leftJoinAndSelect('company.branches', 'branches')
      .leftJoinAndSelect('company.settings', 'settings')
      .leftJoinAndSelect('company.invoiceConfiguration', 'invoiceConfiguration')
      .orderBy('company.createdAt', 'DESC');

    let companies = await query.getMany();

    // ============================================================
    // 2. Filtrer en mémoire (typePlatform, typeCompany, search)
    // ============================================================
    companies = companies.filter((c) => c.typePlatform !== CompanyPlatform.FAVOR_GROUP);

    if (type && type.trim()) {
      const t = type.trim();
      companies = companies.filter((c) => c.typeCompany === t);
    }

    if (search && search.trim()) {
      const kw = search.trim().toLowerCase();
      companies = companies.filter((c) => {
        const fields = [
          c.companyName,
          c.email,
          c.phone,
          c.companyAddress,
          c.address,
          c.website,
        ];
        return fields.some(
          (v) => v != null && String(v).toLowerCase().includes(kw),
        );
      });
    }

    // ============================================================
    // 3. Compter + paginer en mémoire
    // ============================================================
    const total = companies.length;

    const currentPage = Math.max(1, Number(page) || 1);
    const currentLimit = Math.max(1, Number(limit) || 10);
    const skip = (currentPage - 1) * currentLimit;

    const paginated = companies.slice(skip, skip + currentLimit);

    return {
      message: await this.i18n.translate('companies_fetched', lang),
      data: new PaginatedResponseDto(
        paginated,
        total,
        currentPage,
        currentLimit,
      ),
    };
  }
  // ======================== GET COMPANY BY ID ========================
  async getCompanyById(id: string, lang: string = 'fr'): Promise<{ data: any }> {
    const company = await this.companyRepository.findOne({
      where: { id },
      relations: [
        'userHasCompany',
        'userHasCompany.user',
        'userHasCompany.role',
        'companyResources',
        'companyResources.resource',
        'country',
        'city',
        'category',
        'branches',
        'settings',
        'invoiceConfiguration',
      ],
    });
    if (!company) {
      throw new NotFoundException(
        await this.i18n.translate('company_not_found', lang),
      );
    }

    const companyResources = (company.companyResources || []).map((cr) => ({
      id: cr.id,
      companyId: cr.companyId,
      resourceId: cr.resourceId,
      canCreate: cr.can_create,
      canRead: cr.can_read,
      canUpdate: cr.can_update,
      canDelete: cr.can_delete,
      canManage: cr.can_manage,
      status: cr.status,
      createdAt: cr.createdAt,
      updatedAt: cr.updatedAt,
      resource: cr.resource
        ? {
          id: cr.resource.id,
          name: cr.resource.name,
          label: cr.resource.label,
          description: cr.resource.description,
          status: cr.resource.status,
          deleted: cr.resource.deleted,
          createdAt: cr.resource.createdAt,
          updatedAt: cr.resource.updatedAt,
        }
        : null,
    }));

    const userHasCompany = (company.userHasCompany || []).map((uhc) => ({
      id: uhc.id,
      isOwner: uhc.isOwner,
      user: uhc.user
        ? {
          id: uhc.user.id,
          fullName: uhc.user.fullName,
          email: uhc.user.email,
          phone: uhc.user.phone,
          image: uhc.user.image,
          role: uhc.user.role,
          isActive: uhc.user.isActive,
          country: uhc.user.country,
          city: uhc.user.city,
          provider: uhc.user.provider,
          address: uhc.user.address,
          preferredLanguage: uhc.user.preferredLanguage,
          loyaltyPoints: uhc.user.loyaltyPoints,
          dateOfBirth: uhc.user.dateOfBirth,
          vehicleType: uhc.user.vehicleType,
          plateNumber: uhc.user.plateNumber,
          isTwoFAEnabled: uhc.user.isTwoFAEnabled,
          createdAt: uhc.user.createdAt,
          updatedAt: uhc.user.updatedAt,
        }
        : null,
      role: uhc.role,
      company: uhc.company
        ? {
          id: uhc.company.id,
          companyName: uhc.company.companyName,
          status: uhc.company.status,
          typeCompany: uhc.company.typeCompany,
          logo: uhc.company.logo,
        }
        : null,
    }));

    const resources = companyResources.map((cr) => ({
      resourceId: cr.resourceId,
      resource: cr.resource,
      canCreate: cr.canCreate,
      canRead: cr.canRead,
      canUpdate: cr.canUpdate,
      canDelete: cr.canDelete,
      canManage: cr.canManage,
      status: cr.status,
    }));

    const settings = company.settings || null;
    const invoiceConfiguration = (company as any).invoiceConfiguration || null;

    const result = {
      ...company,
      companyResources,
      userHasCompany,
      resources,
      settings,
      invoiceConfiguration,
    };

    delete (result as any).companyResourcesOriginal;

    return { data: result };
  }
  // ======================== FIND BY COMPANY ========================
  async findByCompany(companyId: string, lang: string = 'fr'): Promise<{ data: any }> {
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      relations: [
        'userHasCompany',
        'userHasCompany.user',
        'userHasCompany.role',
        'companyResources',
        'companyResources.resource',
        'country',
        'city',
        'category',
        'branches',
        'branches.country',
        'branches.city',
        'settings',
        'invoiceConfiguration',
      ],
    });

    if (!company) {
      throw new NotFoundException(
        await this.i18n.translate('company_not_found', lang),
      );
    }

    const companyResources = (company.companyResources || []).map((cr) => ({
      id: cr.id,
      companyId: cr.companyId,
      resourceId: cr.resourceId,
      canCreate: cr.can_create,
      canRead: cr.can_read,
      canUpdate: cr.can_update,
      canDelete: cr.can_delete,
      canManage: cr.can_manage,
      status: cr.status,
      createdAt: cr.createdAt,
      updatedAt: cr.updatedAt,
      resource: cr.resource
        ? {
          id: cr.resource.id,
          name: cr.resource.name,
          label: cr.resource.label,
          description: cr.resource.description,
          status: cr.resource.status,
        }
        : null,
    }));

    const userHasCompany = (company.userHasCompany || []).map((uhc) => ({
      id: uhc.id,
      isOwner: uhc.isOwner,
      branchId: uhc.branchId,
      createdAt: uhc.createdAt,
      updatedAt: uhc.updatedAt,
      user: uhc.user
        ? {
          id: uhc.user.id,
          fullName: uhc.user.fullName,
          email: uhc.user.email,
          phone: uhc.user.phone,
          image: uhc.user.image,
          role: uhc.user.role,
          isActive: uhc.user.isActive,
          country: uhc.user.country,
          city: uhc.user.city,
          provider: uhc.user.provider,
          address: uhc.user.address,
          preferredLanguage: uhc.user.preferredLanguage,
          loyaltyPoints: uhc.user.loyaltyPoints,
          dateOfBirth: uhc.user.dateOfBirth,
          vehicleType: uhc.user.vehicleType,
          plateNumber: uhc.user.plateNumber,
          isTwoFAEnabled: uhc.user.isTwoFAEnabled,
          createdAt: uhc.user.createdAt,
          updatedAt: uhc.user.updatedAt,
        }
        : null,
      role: uhc.role,
      company: uhc.company
        ? {
          id: uhc.company.id,
          companyName: uhc.company.companyName,
          status: uhc.company.status,
          typeCompany: uhc.company.typeCompany,
          logo: uhc.company.logo,
        }
        : null,
    }));

    const resources = companyResources.map((cr) => ({
      resourceId: cr.resourceId,
      resource: cr.resource,
      canCreate: cr.canCreate,
      canRead: cr.canRead,
      canUpdate: cr.canUpdate,
      canDelete: cr.canDelete,
      canManage: cr.canManage,
      status: cr.status,
    }));

    const products = await this.productRepo.find({
      where: { company: { id: companyId } },
      relations: ['category', 'images'],
    });

    const settings = company.settings || null;
    const invoiceConfiguration = (company as any).invoiceConfiguration || null;

    return {
      data: {
        ...company,
        companyResources,
        userHasCompany,
        resources,
        products,
        settings,
        invoiceConfiguration,
      },
    };
  }
  // ======================== SET ACTIVE COMPANY ========================
  async setActiveCompany(userId: string, companyId: string, lang: string = 'fr'): Promise<any> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException(await this.i18n.translate('company_not_found', lang));
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
    });
    if (!company) throw new NotFoundException(await this.i18n.translate('company_not_found', lang));
    if (company.status !== CompanyStatus.VALIDATED)
      throw new ForbiddenException(await this.i18n.translate('company_not_authorized', lang));

    const userHasCompany = await this.userHasCompanyRepository.findOne({
      where: { user: { id: userId }, company: { id: companyId } },
    });
    if (!userHasCompany)
      throw new ForbiddenException(await this.i18n.translate('company_user_not_linked', lang));

    user.activeCompany = company;
    user.activeCompanyId = company.id;
    await this.userRepository.save(user);

    const enrichedUser = await this.userRepository
      .createQueryBuilder('users')
      .leftJoinAndSelect('users.userHasCompany', 'userHasCompany')
      .leftJoinAndSelect('userHasCompany.company', 'company')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('company.city', 'city')
      .leftJoinAndSelect('company.branches', 'branches')
      .leftJoinAndSelect('company.category', 'category')
      .leftJoinAndSelect('company.settings', 'settings')
      .leftJoinAndSelect('company.invoiceConfiguration', 'invoiceConfiguration')
      .where('users.id = :id', { id: userId })
      .getOne();

    if (!enrichedUser)
      throw new NotFoundException(
        await this.i18n.translate('company_not_found', lang),
      );

    const { password, ...userWithoutPassword } = enrichedUser;

    const userHasCompanyList =
      userWithoutPassword.userHasCompany?.map((uhc) => {
        const companyData = uhc.company
          ? {
            id: uhc.company.id,
            companyName: uhc.company.companyName || '',
            logo: uhc.company.logo,
            companyAddress: uhc.company.companyAddress || '',
            typeCompany: uhc.company.typeCompany,
            phone: uhc.company.phone,
            vatNumber: uhc.company.vatNumber,
            registrationDocumentUrl: uhc.company.registrationDocumentUrl,
            warehouseLocation: uhc.company.warehouseLocation,
            email: uhc.company.email,
            website: uhc.company.website,
            status: uhc.company.status,
            companyActivity: uhc.company.companyActivity,
            latitude: uhc.company.latitude,
            longitude: uhc.company.longitude,
            address: uhc.company.address,
            country: uhc.company.country,
            city: uhc.company.city,
            localCurrency: uhc.company.localCurrency,
            taux: uhc.company.taux,
            open_time: uhc.company.open_time,
            delivery_minutes: uhc.company.delivery_minutes,
            categoryId: (uhc.company as any).category?.id || null,
            settings: (uhc.company as any).settings || null,
            invoiceConfiguration: (uhc.company as any).invoiceConfiguration || null,
            branches: (uhc.company.branches ?? []).map((b) => ({
              id: b.id,
              name: b.name,
              address: b.address,
              phone: b.phone,
              email: b.email,
              status: b.status,
              deleted: b.deleted,
              country: b.country
                ? { id: b.country.id, name: b.country.name }
                : null,
              city: b.city ? { id: b.city.id, name: b.city.name } : null,
            })),
          }
          : null;
        return { id: uhc.id, isOwner: uhc.isOwner, company: companyData };
      }) ?? [];

    const activeCompanyObj = userHasCompanyList.find(
      (uhc) => uhc.company?.id === userWithoutPassword.activeCompanyId,
    )?.company;
    const activeCompanyWithCategory = activeCompanyObj
      ? { ...activeCompanyObj, categoryId: activeCompanyObj.categoryId ?? null }
      : null;

    return {
      message: await this.i18n.translate('company_updated', lang),
      data: {
        id: userWithoutPassword.id,
        fullName: userWithoutPassword.fullName,
        email: userWithoutPassword.email,
        phone: userWithoutPassword.phone,
        image: userWithoutPassword.image,
        role: userWithoutPassword.role,
        isActive: userWithoutPassword.isActive,
        country: userWithoutPassword.country,
        city: userWithoutPassword.city,
        activeCompanyId: userWithoutPassword.activeCompanyId,
        address: userWithoutPassword.address,
        preferredLanguage: userWithoutPassword.preferredLanguage,
        loyaltyPoints: userWithoutPassword.loyaltyPoints,
        dateOfBirth: userWithoutPassword.dateOfBirth,
        vehicleType: userWithoutPassword.vehicleType,
        plateNumber: userWithoutPassword.plateNumber,
        userHasCompany: userHasCompanyList,
        activeCompany: activeCompanyWithCategory,
      },
    };
  }
  // ======================== FIND ALL BY USER ========================
  async findAllByUser(userId: string, lang: string = 'fr'): Promise<Record<string, any>> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: [
        'activeCompany',
        'activeCompany.country',
        'activeCompany.city',
        'activeCompany.branches',
        'activeCompany.settings',
        'activeCompany.invoiceConfiguration',
        'userHasCompany.company',
        'userHasCompany.company.country',
        'userHasCompany.company.city',
        'userHasCompany.company.category',
        'userHasCompany.company.branches',
        'userHasCompany.company.settings',
        'userHasCompany.company.invoiceConfiguration',
      ],
    });

    if (!user) throw new NotFoundException(await this.i18n.translate('company_not_found', lang));

    const companies =
      user.userHasCompany?.map((uhc) => ({
        ...uhc.company,
        country: uhc.company.country,
        city: uhc.company.city,
        category: uhc.company.category,
        role: uhc.role,
        isOwner: uhc.isOwner,
        settings: uhc.company.settings || null,
        invoiceConfiguration: (uhc.company as any).invoiceConfiguration || null,
        branches: (uhc.company.branches ?? []).map((b) => ({
          id: b.id,
          name: b.name,
          address: b.address,
          phone: b.phone,
          email: b.email,
          status: b.status,
          deleted: b.deleted,
          country: b.country
            ? { id: b.country.id, name: b.country.name }
            : null,
          city: b.city ? { id: b.city.id, name: b.city.name } : null,
        })),
      })) || [];

    const activeCompany = user.activeCompany;
    if (activeCompany) {
      (activeCompany as any).settings = activeCompany.settings || null;
      (activeCompany as any).invoiceConfiguration =
        (activeCompany as any).invoiceConfiguration || null;
    }

    const sanitizedUser = instanceToPlain(user);
    delete sanitizedUser.userHasCompany;
    return { ...sanitizedUser, companies };
  }
  // ======================== FIND COMPANY VALIDATED BY TYPE ========================
  async findCompanyValidatedByType(
    type?: string,
    countryId?: string,
    cityId?: string,
    categoryId?: string,
    page = 1,
    limit = 10,
    lang: string = 'fr',
  ): Promise<{
    message: string;
    data: {
      data: (Omit<CompanyEntity, 'companyResources'> & {
        start: {
          totalProduct: number;
          totalCategory: number;
          totalCommande: number;
        };
        products: any[];
        categories: any[];
        companyResources: any[];
        settings: any;
        invoiceConfiguration: any;
      })[];
      total: number;
      page: number;
      limit: number;
    };
  }> {
    const query = this.companyRepository
      .createQueryBuilder('company')
      .leftJoinAndSelect('company.userHasCompany', 'userHasCompany')
      .leftJoinAndSelect('userHasCompany.user', 'user')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('company.city', 'city')
      .leftJoinAndSelect('company.branches', 'branches')
      .leftJoinAndSelect('company.companyResources', 'companyResources')
      .leftJoinAndSelect('companyResources.resource', 'resource')
      .leftJoinAndSelect('company.settings', 'settings')
      .leftJoinAndSelect('company.invoiceConfiguration', 'invoiceConfiguration')
      .where('company.status = :status', { status: 'VALIDATED' });

    if (type) {
      query.andWhere('company.typeCompany = :type', { type });
      if (type === 'RESTAURANT') {
        query.innerJoin('company.products', 'product', 'product.status = :ps', {
          ps: 'PUBLISHED',
        });
      }
    }
    if (countryId)
      query.andWhere('company.countryId = :countryId', { countryId });
    if (cityId) query.andWhere('company.cityId = :cityId', { cityId });
    if (categoryId)
      query.andWhere('company.categoryId = :categoryId', { categoryId });

    const total = await query.getCount();
    query.skip((page - 1) * limit).take(limit);
    const companies = await query.getMany();

    const enrichedCompanies = await Promise.all(
      companies.map(async (company) => {
        const products = await this.productRepo.find({
          where: { company: { id: company.id } },
          relations: ['category'],
        });
        const totalProduct = products.length;
        const categoriesMap = new Map<string, any>();
        products.forEach((p) => {
          if (p.category) categoriesMap.set(p.category.id, p.category);
        });
        const categories = Array.from(categoriesMap.values());
        const totalCategory = categories.length;
        const totalCommandeResult = await this.orderItemRepo
          .createQueryBuilder('item')
          .innerJoin('item.product', 'product')
          .where('product.companyId = :companyId', { companyId: company.id })
          .select('COUNT(DISTINCT item.orderId)', 'count')
          .getRawOne();
        const totalCommande = Number(totalCommandeResult?.count || 0);

        company.userHasCompany?.forEach((uhc) => {
          if (uhc.user) delete (uhc.user as any).password;
        });

        const transformedResources = (company.companyResources ?? []).map(
          (cr) => ({
            id: cr.id,
            canCreate: cr.can_create,
            canRead: cr.can_read,
            canUpdate: cr.can_update,
            canDelete: cr.can_delete,
            canManage: cr.can_manage,
            status: cr.status,
            resource: cr.resource
              ? {
                id: cr.resource.id,
                name: cr.resource.name,
                label: cr.resource.label,
              }
              : null,
          }),
        );

        const { companyResources, ...companyWithoutResources } = company;

        const settings = company.settings || null;
        const invoiceConfiguration = (company as any).invoiceConfiguration || null;

        return {
          ...companyWithoutResources,
          products,
          categories,
          companyResources: transformedResources,
          settings,
          invoiceConfiguration,
          start: { totalProduct, totalCategory, totalCommande },
        };
      }),
    );

    enrichedCompanies.sort(
      (a, b) => b.start.totalCommande - a.start.totalCommande,
    );

    const message =
      total > 0
        ? await this.i18n.translate('company_created', lang)
        : await this.i18n.translate('company_not_found', lang);
    return {
      message,
      data: { data: enrichedCompanies, total, page: page, limit: limit },
    };
  }
  // ======================== GET COMPANY DASHBOARD ========================
  async getCompanyDashboard(
    user: UserEntity,
    startDate?: string,
    endDate?: string,
    lang: string = 'fr',
  ) {
    const companyId = user.activeCompanyId;
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
    });
    if (!company) throw new NotFoundException(await this.i18n.translate('company_not_found', lang));

    let start: Date | null = null;
    let end: Date | null = null;
    let dateFilter: any = {};

    if (startDate && endDate) {
      start = startOfDay(parseISO(startDate));
      end = endOfDay(parseISO(endDate));
      dateFilter = { createdAt: Between(start, end) };
    }

    const totalProducts = await this.productRepo.count({
      where: { company: { id: companyId }, ...dateFilter },
    });
    const totalServices = await this.serviceRepo.count({
      where: { company: { id: companyId }, ...dateFilter },
    });

    const services = await this.serviceRepo.find({
      where: { company: { id: companyId }, ...dateFilter },
      relations: ['prestataires', 'prestataires.prestataire'],
    });
    const prestataireIds = new Set<string>();
    services.forEach((service) => {
      service.prestataires.forEach((link) => {
        if (link.prestataire) prestataireIds.add(link.prestataire.id);
      });
    });
    const totalPrestataires = prestataireIds.size;

    const totalPendingOrders = await this.orderRepo.count({
      where: {
        status: OrderStatus.PENDING,
        subOrders: { company: { id: companyId } },
        ...dateFilter,
      },
    });
    const totalDeliveredOrders = await this.orderRepo.count({
      where: {
        status: OrderStatus.DELIVERED,
        subOrders: { company: { id: companyId } },
        ...dateFilter,
      },
    });
    const today = new Date();
    const totalTodayOrders = await this.orderRepo.count({
      where: {
        subOrders: { company: { id: companyId } },
        createdAt: Between(startOfDay(today), endOfDay(today)),
      },
    });

    const totalShipments = await this.shipmentRepo
      .createQueryBuilder('shipment')
      .where(
        'shipment.pickupCompanyId = :companyId OR shipment.shippingCompanyId = :companyId OR shipment.deliveryCompanyId = :companyId',
        { companyId },
      )
      .getCount();

    const recentShipments = await this.shipmentRepo
      .createQueryBuilder('shipment')
      .leftJoinAndSelect('shipment.package', 'package')
      .leftJoinAndSelect('shipment.user', 'user')
      .leftJoinAndSelect('shipment.deliveryAddress', 'deliveryAddress')
      .where(
        'shipment.pickupCompanyId = :companyId OR shipment.shippingCompanyId = :companyId OR shipment.deliveryCompanyId = :companyId',
        { companyId },
      )
      .orderBy('shipment.createdAt', 'DESC')
      .take(5)
      .getMany();

    const ltaQueryBuilder = this.ltaRepository.createQueryBuilder('lta');
    ltaQueryBuilder.where(
      '(lta.shipperId = :companyId OR lta.consigneeId = :companyId OR lta.Issued_byId = :companyId)',
      { companyId },
    );
    if (start && end) {
      ltaQueryBuilder.andWhere('lta.createdAt BETWEEN :start AND :end', {
        start,
        end,
      });
    }
    const totalLta = await ltaQueryBuilder.getCount();

    const recentLta = await ltaQueryBuilder
      .leftJoinAndSelect('lta.shipper', 'shipper')
      .leftJoinAndSelect('lta.consignee', 'consignee')
      .leftJoinAndSelect('lta.Issued_by', 'Issued_by')
      .leftJoinAndSelect('lta.tracking', 'tracking')
      .orderBy('lta.createdAt', 'DESC')
      .limit(5)
      .getMany();

    return {
      message: await this.i18n.translate('company_dashboard_loaded', lang),
      data: {
        companyId: company.id,
        companyName: company.companyName,
        totalProducts,
        totalServices,
        totalPrestataires,
        totalPendingOrders,
        totalDeliveredOrders,
        totalTodayOrders,
        totalShipments,
        totalLta,
        recentShipments,
        recentLta,
      },
    };
  }

  // ======================== COUNTRY & CITY METHODS ========================
  async createCountry(dto: CreateCountryDto, lang: string = 'fr'): Promise<Country> {
    const country = this.countryRepo.create({ name: dto.name, code: dto.code });
    return await this.countryRepo.save(country);
  }

  async updateCountry(id: string, dto: Partial<CreateCountryDto>, lang: string = 'fr') {
    const country = await this.countryRepo.findOne({ where: { id } });
    if (!country)
      throw new NotFoundException(await this.i18n.translate('company_not_found', lang));
    if (dto.name && dto.name.trim() !== '') country.name = dto.name;
    if (dto.code && dto.code.trim() !== '') country.code = dto.code;
    const updated = await this.countryRepo.save(country);
    return { message: await this.i18n.translate('company_country_updated', lang), data: updated };
  }

  async createCity(dto: CreateCityDto, lang: string = 'fr'): Promise<any> {
    const country = await this.countryRepo.findOne({
      where: { id: dto.countryId },
    });
    if (!country)
      throw new NotFoundException(
        await this.i18n.translate('company_not_found', lang),
      );

    const existingCity = await this.cityRepo.findOne({
      where: { name: dto.name, country: { id: dto.countryId } },
      relations: ['country'],
    });
    if (existingCity)
      throw new BadRequestException(
        await this.i18n.translate('company_city_exists', lang, { name: dto.name }),
      );

    // ✅ Le tarif est stocké en pur JSON avec la devise
    const city = this.cityRepo.create({
      name: dto.name,
      country,
      tarif: dto.tarif ?? null,
    });

    const saved = await this.cityRepo.save(city);
    return {
      message: await this.i18n.translate('company_city_created', lang),
      data: saved,
    };
  }

  async getCityByName(name: string, lang: string = 'fr'): Promise<{ message: string; data: City }> {
    if (!name || name.trim() === '') {
      throw new BadRequestException(
        await this.i18n.translate('city_name_required', lang),
      );
    }

    const city = await this.cityRepo.findOne({
      where: { name: name.trim() },
      relations: ['country'],
    });

    if (!city) {
      throw new NotFoundException(
        await this.i18n.translate('city_not_found', lang, { name: name.trim() }),
      );
    }

    return {
      message: await this.i18n.translate('city_retrieved', lang, { name: city.name }),
      data: city,
    };
  }

  async updateCity(id: string, dto: UpdateCityDto, lang: string = 'fr') {
    const city = await this.cityRepo.findOne({
      where: { id },
      relations: ['country'],
    });
    if (!city) throw new NotFoundException(await this.i18n.translate('company_not_found', lang));

    if (dto.name && dto.name.trim() !== '') {
      const existingCity = await this.cityRepo.findOne({
        where: { name: dto.name, country: { id: city.country.id } },
        relations: ['country'],
      });
      if (existingCity && existingCity.id !== id) {
        throw new BadRequestException(
          await this.i18n.translate('company_city_exists', lang, { name: dto.name }),
        );
      }
      city.name = dto.name;
    }

    if (dto.countryId && dto.countryId !== city.country.id) {
      const newCountry = await this.countryRepo.findOne({
        where: { id: dto.countryId },
      });
      if (!newCountry)
        throw new NotFoundException(await this.i18n.translate('company_not_found', lang));
      city.country = newCountry;
    }

    // ✅ Gestion du tarif en pur JSON avec devise
    if (dto.clearTarif) {
      city.tarif = null;
    } else if (dto.tarif !== undefined) {
      city.tarif = dto.tarif === null ? null : dto.tarif;
    }

    if (dto.status !== undefined) {
      city.status = dto.status;
    }

    const updated = await this.cityRepo.save(city);
    return {
      message: await this.i18n.translate('company_city_updated', lang),
      data: updated,
    };
  }

  async getAllCountries(lang: string = 'fr'): Promise<Country[]> {
    return await this.countryRepo.find({ relations: ['cities'] });
  }

  async getAllCities(lang: string = 'fr'): Promise<City[]> {
    return await this.cityRepo.find({ relations: ['country'] });
  }

  async getCitiesByCountry(countryId: string, lang: string = 'fr'): Promise<City[]> {
    const country = await this.countryRepo.findOne({
      where: { id: countryId },
    });
    if (!country)
      throw new NotFoundException(await this.i18n.translate('company_not_found', lang));
    return await this.cityRepo.find({ where: { countryId } });
  }

  async getCompaniesWithShippingResource(): Promise<CompanyEntity[]> {
    return this.companyRepository
      .createQueryBuilder('company')
      .innerJoin(CompanyHasResourceEntity, 'chr', 'chr.companyId = company.id')
      .innerJoin('chr.resource', 'resource')
      .where('company.typeCompany = :typeCompany', {
        typeCompany: CompanyType.SHIPPING,
      })
      .andWhere('chr.can_create = :canCreate', { canCreate: true })
      .getMany();
  }

  async getCountryById(id: string, lang: string = 'fr'): Promise<Country> {
    const country = await this.countryRepo.findOne({
      where: { id },
      relations: ['cities'],
    });
    if (!country)
      throw new NotFoundException(
        await this.i18n.translate('company_not_found', lang),
      );
    return country;
  }

  async getCityById(id: string, lang: string = 'fr'): Promise<City> {
    const city = await this.cityRepo.findOne({
      where: { id },
      relations: ['country'],
    });
    if (!city)
      throw new NotFoundException(
        await this.i18n.translate('company_not_found', lang),
      );
    return city;
  }

  async toggleStatus(
    type: 'country' | 'city',
    id: string,
    lang: string = 'fr',
  ): Promise<Country | City> {
    if (type === 'country') {
      const country = await this.countryRepo.findOne({ where: { id } });
      if (!country)
        throw new NotFoundException(await this.i18n.translate('company_not_found', lang));
      country.status = !country.status;
      return await this.countryRepo.save(country);
    }
    if (type === 'city') {
      const city = await this.cityRepo.findOne({ where: { id } });
      if (!city)
        throw new NotFoundException(await this.i18n.translate('company_not_found', lang));
      city.status = !city.status;
      return await this.cityRepo.save(city);
    }
    throw new NotFoundException(
      await this.i18n.translate('company_not_found', lang),
    );
  }

  // ======================== SET USER COMPANY PERMISSIONS ========================
  async setUserCompanyPermissions(
    dto: SetUserCompanyPermissionsDto,
    lang: string = 'fr',
  ): Promise<{ message: string; data: SetUserCompanyPermissionsResponseDto }> {
    if (!dto?.userId) {
      throw new BadRequestException(
        await this.i18n.translate('company_assignment.user_id_required', lang),
      );
    }
    if (!dto?.companyId) {
      throw new BadRequestException(
        await this.i18n.translate('company_assignment.company_id_required', lang),
      );
    }

    const user = await this.userRepository.findOne({ where: { id: dto.userId } });
    if (!user) {
      throw new NotFoundException(await this.i18n.translate('user_not_found', lang));
    }
    const company = await this.companyRepository.findOne({ where: { id: dto.companyId } });
    if (!company) {
      throw new NotFoundException(await this.i18n.translate('company_not_found', lang));
    }

    // ✅ Affectation (si besoin) + permissions immédiates
    const result = await this.applyCompanyAssignment({
      user,
      company,
      branchId: dto.branchId,
      permissions: dto.permissions,
      ceiling: 'company',
      setActiveCompany: 'always',
      lang,
    });

    return {
      message: await this.assignmentMessage(result, lang),
      data: {
        userId: user.id,
        companyId: company.id,
        branchId: result.branch.id,
        branchName: result.branch.name ?? '',
        permissionsCount: result.permissions.length,
        permissions: result.permissions,
        wasAlreadyAssigned: result.wasAlreadyAssigned,
        defaultPermissionsApplied: result.defaultPermissionsApplied,
        permissionsKept: result.permissionsKept,
        ignoredResourceIds: result.ignoredResourceIds,
      },
    };
  }
  // ======================== GET COMPANY RESOURCES ========================
  async getCompanyResources(activeCompanyId: string, lang: string = 'fr'): Promise<any[]> {
    const company = await this.companyRepository.findOne({
      where: { id: activeCompanyId },
    });
    if (!company) {
      throw new NotFoundException(await this.i18n.translate('company_not_found', lang));
    }

    const companyResources = await this.companyHasResourceRepo.find({
      where: { companyId: activeCompanyId },
      relations: ['resource'],
    });

    return companyResources.map((cr) => ({
      id: cr.id,
      resourceId: cr.resourceId,
      resource: cr.resource
        ? {
          id: cr.resource.id,
          name: cr.resource.name,
          label: cr.resource.label,
          description: cr.resource.description,
          status: cr.resource.status,
        }
        : null,
      permissions: {
        canCreate: cr.can_create,
        canRead: cr.can_read,
        canUpdate: cr.can_update,
        canDelete: cr.can_delete,
        canManage: cr.can_manage,
      },
      status: cr.status,
      createdAt: cr.createdAt,
      updatedAt: cr.updatedAt,
    }));
  }

  async assignUserToCompany(
    dto: AssignUserToCompanyDto,
    currentUser: UserEntity,
    lang: string = 'fr',
  ): Promise<{ message: string; data: any }> {
    const activeCompanyId = currentUser?.activeCompanyId;
    if (!activeCompanyId) {
      throw new BadRequestException(
        await this.i18n.translate('company_no_active', lang),
      );
    }

    const email = (dto.email ?? '').trim();
    const targetUser = await this.userRepository.findOne({ where: { email } });
    if (!targetUser) {
      throw new NotFoundException(
        await this.i18n.translate('company_assignment.user_not_found_by_email', lang, { email }),
      );
    }

    const company = await this.companyRepository.findOne({ where: { id: activeCompanyId } });
    if (!company) {
      throw new NotFoundException(await this.i18n.translate('company_not_found', lang));
    }

    // ✅ Affectation + permissions immédiates.
    //    Plafond = droits du propriétaire s'il en a, sinon ressources de l'entreprise.
    //    Sans dto.resources : permissions par défaut (plus jamais "user sans permissions").
    const result = await this.applyCompanyAssignment({
      user: targetUser,
      company,
      branchId: dto.branchId,
      permissions: dto.resources,
      ceiling: 'owner',
      promoteToAdmin: true,
      setActiveCompany: 'always',
      lang,
    });

    const { password, twoFASecret, ...userWithoutPassword } = targetUser as any;
    return {
      message: await this.assignmentMessage(result, lang),
      data: {
        ...userWithoutPassword,
        assignment: {
          userHasCompanyId: result.userCompanyId,
          companyId: company.id,
          branchId: result.branch.id,
          branchName: result.branch.name ?? '',
          permissionsCount: result.permissions.length,
          permissions: result.permissions,
          wasAlreadyAssigned: result.wasAlreadyAssigned,
          defaultPermissionsApplied: result.defaultPermissionsApplied,
          permissionsKept: result.permissionsKept,
          ignoredResourceIds: result.ignoredResourceIds,
        },
      },
    };
  }

  // ============================================================================
  // 🔐 AFFECTATION UTILISATEUR ↔ ENTREPRISE + PERMISSIONS (moteur commun)
  //    Utilisé par : setUserCompanyPermissions, assignUserToCompany, CreateUserToCompany
  // ============================================================================

  /**
   * Permissions initiales du propriétaire à la création d'une entreprise.
   * Utilise le moteur commun : company_has_resource (si l'entreprise n'a encore aucune
   * ressource) + company_has_user_resource, avec tous les droits pour le propriétaire.
   * Une erreur ici n'annule pas la création de l'entreprise : elle est journalisée.
   */
  private async grantInitialOwnerPermissions(
    user: UserEntity,
    company: CompanyEntity,
    branchId: string,
    lang: string,
  ): Promise<void> {
    try {
      const fullUser =
        (await this.userRepository.findOne({ where: { id: user.id } })) ?? user;
      const result = await this.applyCompanyAssignment({
        user: fullUser,
        company,
        branchId,
        permissions: null,
        ceiling: 'company',
        isOwner: true,
        setActiveCompany: 'always',
        lang,
      });
      console.log(
        `✅ [grantInitialOwnerPermissions] ${result.permissions.length} permission(s) données au propriétaire ${user.id}`,
      );
    } catch (error) {
      console.error(
        `❌ [grantInitialOwnerPermissions] company=${company.id} user=${user.id} :`,
        error?.message ?? error,
      );
    }
  }

  /**
   * Détermine la branche d'une affectation.
   * Priorité : branche demandée → candidates (branche de l'affectation, branche active)
   *            → première branche de l'entreprise.
   */
  private async resolveAssignmentBranch(
    companyId: string,
    requestedBranchId: string | undefined | null,
    candidateIds: (string | undefined | null)[],
    lang: string,
  ): Promise<BranchEntity> {
    if (requestedBranchId) {
      const branch = await this.branchRepo.findOne({
        where: { id: requestedBranchId, company_id: companyId },
      });
      if (!branch) {
        throw new BadRequestException(
          await this.i18n.translate('company_invalid_branch', lang),
        );
      }
      return branch;
    }

    for (const id of candidateIds.filter((v): v is string => !!v)) {
      const branch = await this.branchRepo.findOne({
        where: { id, company_id: companyId },
      });
      if (branch) return branch;
    }

    const first = await this.branchRepo.findOne({
      where: { company_id: companyId },
      order: { createdAt: 'ASC' },
    });
    if (!first) {
      throw new BadRequestException(
        await this.i18n.translate('company_assignment.no_branch', lang),
      );
    }
    return first;
  }

  /**
   * Plafond de permissions applicable à un collaborateur :
   *  - 'owner'   : droits du propriétaire de l'entreprise (s'il en a), sinon ceux de l'entreprise
   *  - 'company' : ressources autorisées pour l'entreprise (company_has_resource)
   * Retourne null si aucune restriction n'est configurée (entreprise sans ressources).
   */
  private async getAssignmentCeiling(
    companyId: string,
    mode: 'company' | 'owner',
  ): Promise<Map<string, AssignmentPermission> | null> {
    if (mode === 'owner') {
      const owner = await this.userHasCompanyRepository.findOne({
        where: { company: { id: companyId }, isOwner: true },
      });
      if (owner) {
        const ownerPerms = await this.companyUserResourceRepo.find({
          where: { userCompanyId: owner.id, status: true },
        });
        if (ownerPerms.length) {
          const map = new Map<string, AssignmentPermission>();
          for (const p of ownerPerms) {
            const prev = map.get(p.resourceId);
            map.set(p.resourceId, {
              resourceId: p.resourceId,
              canRead: !!p.canRead || !!prev?.canRead,
              canCreate: !!p.canCreate || !!prev?.canCreate,
              canUpdate: !!p.canUpdate || !!prev?.canUpdate,
              canDelete: !!p.canDelete || !!prev?.canDelete,
              canManage: !!p.canManage || !!prev?.canManage,
              status: true,
            });
          }
          return map;
        }
      }
    }

    const companyResources = await this.companyHasResourceRepo.find({
      where: { companyId, status: true },
    });
    if (!companyResources.length) return null;

    return new Map(
      companyResources.map((r) => [
        r.resourceId,
        {
          resourceId: r.resourceId,
          canRead: !!r.can_read,
          canCreate: !!r.can_create,
          canUpdate: !!r.can_update,
          canDelete: !!r.can_delete,
          canManage: !!r.can_manage,
          status: true,
        },
      ]),
    );
  }

  /**
   * Droits par défaut d'un nouveau collaborateur (variable ASSIGNMENT_DEFAULT_RIGHTS,
   * ex. "read,create,update" — valeurs possibles : read, create, update, delete, manage).
   */
  private getDefaultAssignmentRights(): Omit<AssignmentPermission, 'resourceId'> {
    const raw = (process.env.ASSIGNMENT_DEFAULT_RIGHTS ?? 'read,create,update')
      .split(',')
      .map((v) => v.trim().toLowerCase());
    return {
      canRead: raw.includes('read') || raw.includes('all'),
      canCreate: raw.includes('create') || raw.includes('all'),
      canUpdate: raw.includes('update') || raw.includes('all'),
      canDelete: raw.includes('delete') || raw.includes('all'),
      canManage: raw.includes('manage') || raw.includes('all'),
      status: true,
    };
  }

  /**
   * Permissions données automatiquement quand aucune n'est envoyée :
   *  - entreprise avec ressources configurées → ces ressources, avec leurs droits
   *    (droits par défaut si la ressource est configurée sans aucun droit)
   *  - entreprise sans ressource configurée → toutes les ressources actives,
   *    avec les droits par défaut (elles seront aussi enregistrées pour l'entreprise)
   *  - propriétaire → tous les droits
   */
  private async buildDefaultPermissions(
    ceiling: Map<string, AssignmentPermission> | null,
    isOwner: boolean,
  ): Promise<AssignmentPermission[]> {
    const defaults = this.getDefaultAssignmentRights();
    const full = {
      canRead: true,
      canCreate: true,
      canUpdate: true,
      canDelete: true,
      canManage: true,
      status: true,
    };

    let base: AssignmentPermission[];
    if (ceiling && ceiling.size) {
      base = [...ceiling.values()];
    } else {
      // Ressources actives (status/deleted NULL acceptés pour les anciennes lignes)
      let resources = await this.resourceRepo
        .createQueryBuilder('r')
        .select(['r.id'])
        .where('(r.status = 1 OR r.status IS NULL)')
        .andWhere('(r.deleted = 0 OR r.deleted IS NULL)')
        .getMany();
      if (!resources.length) {
        resources = await this.resourceRepo.find({ select: ['id'] });
      }
      base = resources.map((r) => ({ resourceId: r.id }));
    }

    return base.map((p) => {
      if (isOwner) return { resourceId: p.resourceId, ...full };
      const hasAnyRight =
        !!p.canRead || !!p.canCreate || !!p.canUpdate || !!p.canDelete || !!p.canManage;
      return hasAnyRight
        ? { ...p, status: true }
        : { resourceId: p.resourceId, ...defaults };
    });
  }

  /**
   * Affecte un utilisateur à une entreprise et lui donne ses permissions immédiatement.
   *
   * Règles :
   *  - Permissions envoyées → appliquées (limitées au plafond de l'entreprise / du propriétaire).
   *  - Aucune permission envoyée :
   *      • première affectation, ou affectation existante SANS aucun droit utile
   *        → permissions par défaut (voir buildDefaultPermissions) : TOUJOURS au moins une permission
   *      • isOwner → tous les droits sur toutes les ressources
   *      • affectation existante avec des droits → conservés tels quels
   *  - Entreprise sans ressource configurée → les ressources demandées sont acceptées
   *    et enregistrées au niveau de l'entreprise.
   *  - Tout est fait dans une transaction (tout ou rien).
   */
  private async applyCompanyAssignment(options: {
    user: UserEntity;
    company: CompanyEntity;
    branchId?: string | null;
    permissions?: AssignmentPermission[] | null;
    ceiling: 'company' | 'owner';
    isOwner?: boolean;
    role?: RoleUser | null;
    setActiveCompany?: 'always' | 'if-empty';
    promoteToAdmin?: boolean;
    lang: string;
  }): Promise<AssignmentResult> {
    const { user, company, lang } = options;
    const companyId = company.id;

    if (!user.isActive || (user as any).deleted) {
      throw new BadRequestException(
        await this.i18n.translate('company_assignment.user_inactive', lang),
      );
    }

    const existing = await this.userHasCompanyRepository.findOne({
      where: { user: { id: user.id }, company: { id: companyId } },
      relations: ['branch'],
    });
    const wasAlreadyAssigned = !!existing;

    const branch = await this.resolveAssignmentBranch(
      companyId,
      options.branchId,
      [existing?.branchId, user.activeBranchId],
      lang,
    );

    // Permissions "utiles" existantes (au moins un droit à vrai)
    const existingPermCount = existing
      ? await this.companyUserResourceRepo
        .createQueryBuilder('p')
        .where('p.userCompanyId = :id', { id: existing.id })
        .andWhere(
          '(p.can_read = 1 OR p.can_create = 1 OR p.can_update = 1 OR p.can_delete = 1 OR p.can_manage = 1)',
        )
        .getCount()
      : 0;

    const ceiling = await this.getAssignmentCeiling(companyId, options.ceiling);
    const requested = (options.permissions ?? []).filter((p) => p && p.resourceId);
    const isOwner = options.isOwner ?? existing?.isOwner ?? false;

    // ------------------------------------------------------------
    // 1. Permissions à appliquer
    // ------------------------------------------------------------
    let mode: 'replace' | 'keep' = 'replace';
    let defaultPermissionsApplied = false;
    let source: AssignmentPermission[] = requested;

    if (!requested.length) {
      if (isOwner || !wasAlreadyAssigned || existingPermCount === 0) {
        // ✅ Première affectation (ou affectation sans aucune permission) :
        //    l'utilisateur reçoit TOUJOURS des permissions.
        source = await this.buildDefaultPermissions(ceiling, isOwner);
        defaultPermissionsApplied = true;
      } else {
        mode = 'keep';
      }
    }

    // Dédoublonnage (la dernière occurrence l'emporte)
    const dedup = new Map<string, AssignmentPermission>();
    for (const p of source) dedup.set(p.resourceId, p);

    // Les ressources doivent exister
    const ids = [...dedup.keys()];
    const existingResources = ids.length
      ? await this.resourceRepo.find({ where: { id: In(ids) }, select: ['id'] })
      : [];
    const existingIds = new Set(existingResources.map((r) => r.id));

    const toGrant: AssignmentPermission[] = [];
    const toRegisterAtCompany: AssignmentPermission[] = [];
    const ignoredResourceIds: string[] = [];

    for (const p of dedup.values()) {
      if (!existingIds.has(p.resourceId)) {
        ignoredResourceIds.push(p.resourceId);
        continue;
      }
      if (ceiling) {
        const max = ceiling.get(p.resourceId);
        if (!max) {
          ignoredResourceIds.push(p.resourceId);
          continue;
        }
        // Mode 'owner' : un collaborateur ne peut pas dépasser les droits du propriétaire.
        // Mode 'company' : la ressource doit être autorisée pour l'entreprise,
        //                  les droits envoyés par l'administrateur sont appliqués tels quels.
        const maxHasAnyRight =
          !!max.canRead || !!max.canCreate || !!max.canUpdate || !!max.canDelete || !!max.canManage;
        const strict = options.ceiling === 'owner' && maxHasAnyRight;
        toGrant.push({
          resourceId: p.resourceId,
          canRead: !!p.canRead && (!strict || !!max.canRead),
          canCreate: !!p.canCreate && (!strict || !!max.canCreate),
          canUpdate: !!p.canUpdate && (!strict || !!max.canUpdate),
          canDelete: !!p.canDelete && (!strict || !!max.canDelete),
          canManage: !!p.canManage && (!strict || !!max.canManage),
          status: p.status ?? true,
        });
      } else {
        toRegisterAtCompany.push(p);
        toGrant.push({
          resourceId: p.resourceId,
          canRead: !!p.canRead,
          canCreate: !!p.canCreate,
          canUpdate: !!p.canUpdate,
          canDelete: !!p.canDelete,
          canManage: !!p.canManage,
          status: p.status ?? true,
        });
      }
    }

    if (requested.length > 0 && toGrant.length === 0) {
      throw new BadRequestException(
        await this.i18n.translate('company_assignment.no_valid_permissions', lang, {
          count: ignoredResourceIds.length,
        }),
      );
    }

    // ------------------------------------------------------------
    // 2. Transaction
    // ------------------------------------------------------------
    const granted: PermissionResponseDto[] = [];
    let userCompanyId = existing?.id ?? '';

    try {
      await this.dataSource.transaction(async (em) => {
        // 2.1 Affectation
        let userCompany: UserHasCompanyEntity;
        if (!existing) {
          userCompany = await em.save(
            em.create(UserHasCompanyEntity, {
              user: { id: user.id } as UserEntity,
              company: { id: companyId } as CompanyEntity,
              isOwner,
              branch: { id: branch.id } as BranchEntity,
              branchId: branch.id,
              ...(options.role ? { role: options.role } : {}),
            }),
          );
        } else {
          userCompany = existing;
          let changed = false;
          if (userCompany.branchId !== branch.id) {
            userCompany.branchId = branch.id;
            userCompany.branch = branch;
            changed = true;
          }
          if (options.isOwner !== undefined && userCompany.isOwner !== options.isOwner) {
            userCompany.isOwner = options.isOwner;
            changed = true;
          }
          if (options.role) {
            userCompany.role = options.role;
            changed = true;
          }
          if (changed) userCompany = await em.save(userCompany);
        }
        userCompanyId = userCompany.id;

        // 2.2 Entreprise sans ressources configurées → enregistrement
        if (toRegisterAtCompany.length) {
          const already = await em.find(CompanyHasResourceEntity, {
            where: { companyId, resourceId: In(toRegisterAtCompany.map((p) => p.resourceId)) },
          });
          const alreadyIds = new Set(already.map((r) => r.resourceId));
          const missing = toRegisterAtCompany.filter((p) => !alreadyIds.has(p.resourceId));
          if (missing.length) {
            await em.save(
              missing.map((p) =>
                em.create(CompanyHasResourceEntity, {
                  companyId,
                  resourceId: p.resourceId,
                  can_read: !!p.canRead,
                  can_create: !!p.canCreate,
                  can_update: !!p.canUpdate,
                  can_delete: !!p.canDelete,
                  can_manage: !!p.canManage,
                  status: true,
                }),
              ),
            );
          }
        }

        // 2.3 Permissions du collaborateur
        if (mode === 'replace') {
          await em.delete(CompanyHasUserResource, { userCompanyId: userCompany.id });
          if (toGrant.length) {
            const saved = await em.save(
              toGrant.map((p) =>
                em.create(CompanyHasUserResource, {
                  id: uuidv4(),
                  userCompanyId: userCompany.id,
                  resourceId: p.resourceId,
                  branchId: branch.id,
                  canRead: !!p.canRead,
                  canCreate: !!p.canCreate,
                  canUpdate: !!p.canUpdate,
                  canDelete: !!p.canDelete,
                  canManage: !!p.canManage,
                  status: p.status ?? true,
                }),
              ),
            );
            for (const s of saved) {
              granted.push({
                resourceId: s.resourceId,
                canRead: !!s.canRead,
                canCreate: !!s.canCreate,
                canUpdate: !!s.canUpdate,
                canDelete: !!s.canDelete,
                canManage: !!s.canManage,
                status: !!s.status,
              });
            }
          }
        } else {
          // Permissions conservées : on aligne seulement la branche
          await em.update(
            CompanyHasUserResource,
            { userCompanyId: userCompany.id },
            { branchId: branch.id },
          );
          const kept = await em.find(CompanyHasUserResource, {
            where: { userCompanyId: userCompany.id },
          });
          for (const s of kept) {
            granted.push({
              resourceId: s.resourceId,
              canRead: !!s.canRead,
              canCreate: !!s.canCreate,
              canUpdate: !!s.canUpdate,
              canDelete: !!s.canDelete,
              canManage: !!s.canManage,
              status: !!s.status,
            });
          }
        }

        // 2.4 Entreprise / branche active + rôle
        const userPatch: { activeCompanyId?: string; activeBranchId?: string; role?: UserRole } = {};
        const setActive = options.setActiveCompany ?? 'always';
        if (
          user.activeCompanyId !== companyId &&
          (setActive === 'always' || !user.activeCompanyId)
        ) {
          userPatch.activeCompanyId = companyId;
          userPatch.activeBranchId = branch.id;
        } else if (user.activeCompanyId === companyId && user.activeBranchId !== branch.id) {
          userPatch.activeBranchId = branch.id;
        }
        if (
          options.promoteToAdmin &&
          user.role !== UserRole.SUPER_ADMIN &&
          user.role !== UserRole.ADMIN
        ) {
          userPatch.role = UserRole.ADMIN;
        }
        if (Object.keys(userPatch).length) {
          await em.update(UserEntity, { id: user.id }, userPatch);
          Object.assign(user, userPatch);
        }
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error('❌ [applyCompanyAssignment] Échec :', error?.message ?? error);
      throw new InternalServerErrorException(
        await this.i18n.translate('company_assignment.failed', lang),
      );
    }

    if (defaultPermissionsApplied && granted.length === 0) {
      console.warn(
        `⚠️ [applyCompanyAssignment] Company ${companyId} : aucune ressource active trouvée, aucune permission par défaut`,
      );
    }
    console.log(
      `🎉 [applyCompanyAssignment] user=${user.id} company=${companyId} branch=${branch.id} ` +
      `permissions=${granted.length} (${wasAlreadyAssigned ? 'déjà affecté' : 'nouvelle affectation'}, mode=${mode})`,
    );

    return {
      userCompanyId,
      branch,
      wasAlreadyAssigned,
      defaultPermissionsApplied,
      permissionsKept: mode === 'keep',
      ignoredResourceIds,
      permissions: granted,
    };
  }

  /** Message de réponse adapté au résultat de l'affectation */
  private async assignmentMessage(result: AssignmentResult, lang: string): Promise<string> {
    if (result.defaultPermissionsApplied && result.permissions.length === 0) {
      return this.i18n.translate('company_assignment.no_default_permissions', lang);
    }
    return this.i18n.translate(
      result.wasAlreadyAssigned
        ? 'company_assignment.permissions_updated'
        : 'company_assignment.assigned_success',
      lang,
      { count: result.permissions.length },
    );
  }

  private async checkUserCanManageUsers(
    userId: string,
    companyId: string,
  ): Promise<boolean> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (user?.role === UserRole.SUPER_ADMIN) return true;

    const userHasCompany = await this.userHasCompanyRepository.findOne({
      where: { user: { id: userId }, company: { id: companyId } },
      relations: ['resources', 'resources.resource'],
    });
    if (!userHasCompany) return false;

    const managePermissions = userHasCompany.resources?.filter(
      (r) =>
        (r.resource?.name === 'USERS' || r.resource?.name === 'COMPANY') &&
        r.canManage === true,
    );
    return managePermissions && managePermissions.length > 0;
  }

  async getCompanyCollaborators(activeCompanyId: string, lang: string = 'fr'): Promise<any[]> {
    const userHasCompanies = await this.userHasCompanyRepository.find({
      where: { company: { id: activeCompanyId } },
      relations: [
        'user',
        'resources',
        'resources.resource',
        'company',
        'company.branches',
        'company.settings',
        'branch',
      ],
    });

    if (!userHasCompanies.length) return [];

    const branches = await this.branchRepo.find({
      where: { company_id: activeCompanyId },
      select: ['id', 'name'],
    });
    const branchMap = new Map(branches.map((b) => [b.id, b.name]));

    const collaborators: any[] = [];

    for (const uhc of userHasCompanies) {
      const user = uhc.user;
      if (!user) continue;

      const { password, ...userWithoutPassword } = user;

      let branchInfo: { id: string; name: string } | null = null;
      if (uhc.branch) {
        branchInfo = {
          id: uhc.branch.id,
          name: uhc.branch.name,
        };
      }

      const permissions = (uhc.resources || []).map((perm) => ({
        branchId: perm.branchId,
        branchName: branchMap.get(perm.branchId) || 'Inconnue',
        resourceId: perm.resourceId,
        resourceName: perm.resource?.name || 'Ressource inconnue',
        canCreate: perm.canCreate,
        canRead: perm.canRead,
        canUpdate: perm.canUpdate,
        canDelete: perm.canDelete,
        canManage: perm.canManage,
        status: perm.status,
      }));

      collaborators.push({
        id: uhc.id,
        createdAt: uhc.createdAt,
        updatedAt: uhc.updatedAt,
        user: userWithoutPassword,
        isOwner: uhc.isOwner,
        branch: branchInfo,
        permissions,
      });
    }

    return collaborators;
  }

  async getOneCollaboratorByUserHasCompanyId(
    userHasCompanyId: string,
    lang: string = 'fr',
  ): Promise<any> {
    const userHasCompany = await this.userHasCompanyRepository.findOne({
      where: { id: userHasCompanyId },
      relations: [
        'user',
        'resources',
        'resources.resource',
        'company',
        'company.branches',
        'company.settings',
        'branch',
      ],
    });
    if (!userHasCompany) {
      throw new NotFoundException(
        await this.i18n.translate('company_not_found', lang),
      );
    }

    const user = userHasCompany.user;
    if (!user) throw new NotFoundException(await this.i18n.translate('company_not_found', lang));

    const { password, ...userWithoutPassword } = user;

    let mainBranch: { id: string; name: string } | null = null;
    if (userHasCompany.branch) {
      mainBranch = {
        id: userHasCompany.branch.id,
        name: userHasCompany.branch.name,
      };
    }

    const branches = await this.branchRepo.find({
      where: { company_id: userHasCompany.company.id },
      select: ['id', 'name'],
    });
    const branchMap = new Map(branches.map((b) => [b.id, b.name]));

    const permissions = (userHasCompany.resources || []).map((perm) => ({
      branchId: perm.branchId,
      branchName: branchMap.get(perm.branchId) || 'Inconnue',
      resourceId: perm.resourceId,
      resourceName: perm.resource?.name || 'Ressource inconnue',
      canCreate: perm.canCreate,
      canRead: perm.canRead,
      canUpdate: perm.canUpdate,
      canDelete: perm.canDelete,
      canManage: perm.canManage,
      status: perm.status,
    }));

    // ✅ Récupérer les settings de la company
    const settings = userHasCompany.company?.settings || null;

    return {
      id: userHasCompany.id,
      createdAt: userHasCompany.createdAt,
      updatedAt: userHasCompany.updatedAt,
      user: userWithoutPassword,
      isOwner: userHasCompany.isOwner,
      branch: mainBranch,
      permissions,
      settings, // ✅ Ajouter settings
    };
  }

  async updateUserCompanyPermissions(
    userHasCompanyId: string,
    branchId: string | undefined,
    resources: ResourcePermissionDto[],
    currentUser: UserEntity,
    lang: string = 'fr',
  ): Promise<{ message: string; updatedBranchForCurrentUser?: BranchEntity }> {
    const activeCompanyId = currentUser.activeCompanyId;
    if (!activeCompanyId) {
      throw new BadRequestException(
        await this.i18n.translate('company_no_active', lang),
      );
    }

    const userHasCompany = await this.userHasCompanyRepository.findOne({
      where: { id: userHasCompanyId },
      relations: ['company', 'user', 'branch'],
    });
    if (!userHasCompany || !userHasCompany.user) {
      throw new NotFoundException(await this.i18n.translate('user_not_found', lang));
    }
    if (userHasCompany.company?.id !== activeCompanyId) {
      throw new ForbiddenException(
        await this.i18n.translate('company_assignment.not_your_company', lang),
      );
    }

    // const hasPermission = await this.checkUserCanManageUsers(
    //   currentUser.id,
    //   activeCompanyId,
    // );
    // if (!hasPermission) {
    //   throw new ForbiddenException(await this.i18n.translate('company_not_authorized', lang));
    // }

    let isCurrentUser = false;
    const oldBranchId = userHasCompany.branchId;

    const targetUser = userHasCompany.user;
    if (targetUser.activeCompanyId !== userHasCompany.company.id) {
      targetUser.activeCompanyId = userHasCompany.company.id;
      await this.userRepository.save(targetUser);
    }


    if (branchId) {
      const targetBranchExists = await this.branchRepo.findOne({
        where: { id: branchId, company_id: activeCompanyId },
      });
      if (!targetBranchExists) {
        throw new BadRequestException(
          await this.i18n.translate('company_invalid_branch', lang),
        );
      }

      await this.userHasCompanyRepository
        .createQueryBuilder()
        .update(UserHasCompanyEntity)
        .set({ branchId: branchId })
        .where('id = :id', { id: userHasCompany.id })
        .execute();

      const updatedUHC = await this.userHasCompanyRepository.findOne({
        where: { id: userHasCompany.id },
      });
      console.log(
        `[updateUserCompanyPermissions] userHasCompany ${userHasCompany.id} : branchId ${oldBranchId} -> ${updatedUHC?.branchId}`,
      );

      isCurrentUser = userHasCompany.user.id === currentUser.id;

      if (isCurrentUser) {
        currentUser.activeBranchId = branchId;
        await this.userRepository.save(currentUser);
        console.log(
          `[updateUserCompanyPermissions] activeBranchId de l'utilisateur courant mis à ${branchId}`,
        );
      }
    } else {
      console.log(
        `[updateUserCompanyPermissions] Aucune branche fournie, pas de mise à jour`,
      );
    }

    let targetBranch: BranchEntity;
    if (branchId) {
      const branch = await this.branchRepo.findOne({
        where: { id: branchId, company_id: activeCompanyId },
      });
      if (!branch)
        throw new BadRequestException(await this.i18n.translate('company_invalid_branch', lang));
      targetBranch = branch;
    } else {
      const branch =
        userHasCompany.branch ??
        (await this.branchRepo.findOne({
          where: { company_id: activeCompanyId },
          order: { createdAt: 'ASC' },
        }));
      if (!branch) throw new NotFoundException(await this.i18n.translate('company_not_found', lang));
      targetBranch = branch;
    }

    await this.dataSource.transaction(async (manager) => {
      const userResourceRepo = manager.getRepository(CompanyHasUserResource);
      await userResourceRepo.delete({ userCompanyId: userHasCompany.id });

      if (resources && resources.length > 0) {
        const resourceIds = resources.map((r) => r.resourceId);
        const existingResources = await this.resourceRepo.find({
          where: { id: In(resourceIds) },
          select: ['id'],
        });
        const existingIds = new Set(existingResources.map((r) => r.id));
        const invalidIds = resourceIds.filter((id) => !existingIds.has(id));
        if (invalidIds.length) {
          throw new BadRequestException(
            await this.i18n.translate('company_assignment.invalid_resources', lang, {
              ids: invalidIds.join(', '),
            }),
          );
        }

        for (const perm of resources) {
          const newPerm = userResourceRepo.create({
            id: uuidv4(),
            userCompanyId: userHasCompany.id,
            resourceId: perm.resourceId,
            branchId: targetBranch.id,
            canCreate: perm.canCreate ?? false,
            canRead: perm.canRead ?? false,
            canUpdate: perm.canUpdate ?? false,
            canDelete: perm.canDelete ?? false,
            canManage: perm.canManage ?? false,
            status: perm.status ?? true,
          });
          await userResourceRepo.save(newPerm);
        }
      }
    });

    let updatedBranchForCurrentUser: BranchEntity | undefined;
    if (isCurrentUser && branchId) {
      updatedBranchForCurrentUser =
        (await this.branchRepo.findOne({
          where: { id: branchId, company_id: activeCompanyId },
        })) ?? undefined;
    }

    return {
      message: await this.i18n.translate('company_permissions_updated', lang),
      updatedBranchForCurrentUser,
    };
  }

  async createPartner(
    dto: CreatePartnerDto,
    currentUser: UserEntity,
    lang: string = 'fr',
  ): Promise<{ message: string; data: CompanyHasPartnerEntity }> {
    const companyId = currentUser.activeCompanyId;
    if (!companyId) {
      throw new BadRequestException(
        await this.i18n.translate('company_no_active', lang),
      );
    }

    const partnerCompany = await this.companyRepository.findOne({
      where: { id: dto.partnerCompanyId },
    });
    if (!partnerCompany) {
      throw new NotFoundException(
        await this.i18n.translate('company_partner_not_found', lang),
      );
    }

    const existing = await this.partnerRepo.findOne({
      where: {
        companyId,
        partnerCompanyId: dto.partnerCompanyId,
      },
    });
    if (existing) {
      throw new ConflictException(await this.i18n.translate('company_partner_exists', lang));
    }

    const partnership = this.partnerRepo.create({
      companyId,
      partnerCompanyId: dto.partnerCompanyId,
      notes: dto.notes,
      status: true,
    });

    const saved = await this.partnerRepo.save(partnership);

    return {
      message: await this.i18n.translate('company_partner_created', lang),
      data: saved,
    };
  }

  async getPartners(
    currentUser: UserEntity,
    lang: string = 'fr',
  ): Promise<{ message: string; data: CompanyHasPartnerEntity[] }> {
    const companyId = currentUser.activeCompanyId;
    if (!companyId) {
      throw new BadRequestException(
        await this.i18n.translate('company_no_active', lang),
      );
    }

    const partners = await this.partnerRepo.find({
      where: { companyId, status: true },
      relations: ['partnerCompany'],
    });

    return {
      message:
        partners.length > 0
          ? await this.i18n.translate('company_partner_created', lang)
          : await this.i18n.translate('company_partner_not_found', lang),
      data: partners,
    };
  }

  async createCompanySettings(
    dto: CreateCompanySettingsDto,
    lang: string = 'fr',
  ): Promise<{ message: string; data: CompanySettingsEntity }> {
    // Vérifier que la société existe
    const company = await this.companyRepository.findOne({
      where: { id: dto.companyId },
    });
    if (!company) {
      throw new NotFoundException(
        await this.i18n.translate('company_not_found', lang),
      );
    }

    // Vérifier si les paramètres existent déjà
    const existing = await this.companySettingsRepository.findOne({
      where: { companyId: dto.companyId },
    });
    if (existing) {
      throw new ConflictException(
        await this.i18n.translate('company_settings_already_exists', lang),
      );
    }

    // Créer les paramètres
    const settings = this.companySettingsRepository.create({
      companyId: dto.companyId,
      enableLoyaltyFees: dto.enableLoyaltyFees ?? false,
      loyaltyFeeFixed: dto.loyaltyFeeFixed ?? 0,
    });

    const saved = await this.companySettingsRepository.save(settings);

    return {
      message: await this.i18n.translate('company_settings_created', lang),
      data: saved,
    };
  }

  async updateCompanySettings(
    companyId: string,
    dto: UpdateCompanySettingsDto,
    lang: string = 'fr',
  ): Promise<{ message: string; data: CompanySettingsEntity }> {
    // Vérifier que la société existe
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException(
        await this.i18n.translate('company_not_found', lang),
      );
    }

    // Récupérer les paramètres existants
    let settings = await this.companySettingsRepository.findOne({
      where: { companyId },
    });

    // Si les paramètres n'existent pas, les créer avec les valeurs par défaut
    if (!settings) {
      settings = this.companySettingsRepository.create({
        companyId,
        enableLoyaltyFees: dto.enableLoyaltyFees ?? false,
        loyaltyFeeFixed: dto.loyaltyFeeFixed ?? 0,
      });
      const saved = await this.companySettingsRepository.save(settings);
      return {
        message: await this.i18n.translate('company_settings_created', lang),
        data: saved,
      };
    }

    // Mettre à jour les champs
    if (dto.enableLoyaltyFees !== undefined) {
      settings.enableLoyaltyFees = dto.enableLoyaltyFees;
    }
    if (dto.loyaltyFeeFixed !== undefined) {
      settings.loyaltyFeeFixed = dto.loyaltyFeeFixed;
    }

    const updated = await this.companySettingsRepository.save(settings);

    return {
      message: await this.i18n.translate('company_settings_updated', lang),
      data: updated,
    };
  }

  async getCompanySettings(
    companyId: string,
    lang: string = 'fr',
  ): Promise<{ message: string; data: CompanySettingsEntity }> {
    // Vérifier que la société existe
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException(
        await this.i18n.translate('company_not_found', lang),
      );
    }

    // Récupérer les paramètres
    let settings = await this.companySettingsRepository.findOne({
      where: { companyId },
    });

    // Si les paramètres n'existent pas, les créer avec les valeurs par défaut
    if (!settings) {
      settings = this.companySettingsRepository.create({
        companyId,
        enableLoyaltyFees: false,
        loyaltyFeeFixed: 0,
      });
      settings = await this.companySettingsRepository.save(settings);
    }

    return {
      message: await this.i18n.translate('company_settings_retrieved', lang),
      data: settings,
    };
  }

  // ============================================
  // 4. RÉCUPÉRER UN SEUL PARAMÈTRE (PAR ID)
  // ============================================
  async getOneCompanySettings(
    id: string,
    lang: string = 'fr',
  ): Promise<{ message: string; data: CompanySettingsEntity }> {
    const settings = await this.companySettingsRepository.findOne({
      where: { id },
      relations: ['company'],
    });

    if (!settings) {
      throw new NotFoundException(
        await this.i18n.translate('company_settings_not_found', lang),
      );
    }

    return {
      message: await this.i18n.translate('company_settings_retrieved', lang),
      data: settings,
    };
  }


  // ============================================
  // ✅ INVOICE CONFIGURATION
  // ============================================

  /**
   * Récupérer la configuration de facture par companyId
   */
  async getInvoiceConfiguration(
    companyId: string,
    lang: string = 'fr',
  ): Promise<{ message: string; data: InvoiceConfigurationEntity | null }> {
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException(
        await this.i18n.translate('company_not_found', lang),
      );
    }

    const config = await this.invoiceConfigRepo.findOne({
      where: { companyId },
      relations: ['company'],
    });

    return {
      message: await this.i18n.translate('company_settings_retrieved', lang),
      data: config || null,
    };
  }

  /**
   * Créer ou mettre à jour la configuration de facture
   */
  async createOrUpdateInvoiceConfiguration(
    companyId: string,
    dto: CreateInvoiceConfigurationDto | UpdateInvoiceConfigurationDto,
    lang: string = 'fr',
    logoFile?: Express.Multer.File,   // ✅ AJOUT
  ): Promise<{ message: string; data: InvoiceConfigurationEntity }> {
    // 1. Vérifier que la société existe
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException(
        await this.i18n.translate('company_not_found', lang),
      );
    }

    // ✅ 2. Upload du logo si fourni
    let logoUrl: string | null = null;
    if (logoFile) {
      const uploadResult = await this.filesService.uploadFile(
        logoFile,
        'invoice-configuration/logo',
        'default',
      );
      logoUrl = uploadResult.data as string;
    }

    // 3. Chercher la config existante
    let config = await this.invoiceConfigRepo.findOne({
      where: { companyId },
    });

    if (config) {
      // Mise à jour
      Object.assign(config, dto);

      // ✅ Si un nouveau logo est uploadé, on remplace
      if (logoUrl) {
        config.logo = logoUrl;
      }

      const updated = await this.invoiceConfigRepo.save(config);
      return {
        message: await this.i18n.translate('company_settings_updated', lang),
        data: updated,
      };
    }

    // Création
    const newConfig = this.invoiceConfigRepo.create({
      companyId,
      logo: logoUrl ?? dto.logo ?? null,   // ✅ logo uploadé en priorité
      email: dto.email ?? null,
      phone: dto.phone ?? null,
      address: dto.address ?? null,
      rccm: dto.rccm ?? null,
      website: dto.website ?? null,
    } as Partial<InvoiceConfigurationEntity>);

    const saved = await this.invoiceConfigRepo.save(newConfig);
    return {
      message: await this.i18n.translate('company_settings_created', lang),
      data: saved,
    };
  }

  /**
   * Mettre à jour partiellement la configuration de facture
   */
  async updateInvoiceConfiguration(
    companyId: string,
    dto: UpdateInvoiceConfigurationDto,
    lang: string = 'fr',
    logoFile?: Express.Multer.File,   // ✅ AJOUT
  ): Promise<{ message: string; data: InvoiceConfigurationEntity }> {
    const config = await this.invoiceConfigRepo.findOne({
      where: { companyId },
    });

    if (!config) {
      throw new NotFoundException(
        await this.i18n.translate('company_settings_not_found', lang),
      );
    }

    // ✅ Upload du logo si fourni
    if (logoFile) {
      const uploadResult = await this.filesService.uploadFile(
        logoFile,
        'invoice-configuration/logo',
        'default',
      );
      config.logo = uploadResult.data as string;
    }

    Object.assign(config, dto);
    const updated = await this.invoiceConfigRepo.save(config);

    return {
      message: await this.i18n.translate('company_settings_updated', lang),
      data: updated,
    };
  }

  /**
   * Supprimer la configuration de facture
   */
  async deleteInvoiceConfiguration(
    companyId: string,
    lang: string = 'fr',
  ): Promise<{ message: string }> {
    const config = await this.invoiceConfigRepo.findOne({
      where: { companyId },
    });

    if (!config) {
      throw new NotFoundException(
        await this.i18n.translate('company_settings_not_found', lang),
      );
    }

    await this.invoiceConfigRepo.remove(config);
    return {
      message: await this.i18n.translate('company_settings_deleted', lang),
    };
  }
}