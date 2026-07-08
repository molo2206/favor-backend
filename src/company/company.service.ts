/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateCompanyDto } from './dto/create-company.dto';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { CompanyEntity, FeeBasis, FeeType } from './entities/company.entity';
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
import { SmsHelper } from 'src/users/utility/helpers/sms.helper';
import {
  CreateCompanyAdminDto,
  ResourcePermissionDto,
} from './dto/create-company-admin.dto';
import { UserPlatformRoleEntity } from 'src/users/entities/user_plateform_roles.entity';
import { NotificationsService } from 'src/notification/notifications.service';
import { UserRole } from 'src/users/enum/user-role-enum';
import { CategoryEntity } from 'src/category/entities/category.entity';
import { OrderItemEntity } from 'src/order-item/entities/order-item.entity';
import { PermissionResponseDto, SetUserCompanyPermissionsDto, SetUserCompanyPermissionsResponseDto } from './dto/setUserCompanyPermissions.dto';
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
    private readonly smsHelper: SmsHelper,
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

    private pushNotificationHelper: PushNotificationHelper,
    private smsService: SmsHelper,
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
      await this.smsHelper.sendSms(user.phone, message);
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
      await this.smsHelper.sendSms(user.phone, message);
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
  ): Promise<{ message: string; data: any }> {
    if (!dto || Object.keys(dto).length === 0) {
      throw new BadRequestException(
        await this.i18n.translate('company_data_required', lang),
      );
    }
    if (!dto.userId) {
      throw new BadRequestException(
        await this.i18n.translate('company_user_not_linked', lang),
      );
    }

    const user = await this.userRepository.findOne({
      where: { id: dto.userId },
    });
    if (!user) throw new NotFoundException(await this.i18n.translate('company_not_found', lang));

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
    const user = await this.userRepository.findOneOrFail({
      where: { id: dto.userId },
    });
    const company = await this.companyRepository.findOneOrFail({
      where: { id: dto.companyId },
    });
    const role = await this.roleRepository.findOneOrFail({
      where: { id: dto.roleId },
    });

    let userHasCompany = await this.userHasCompanyRepository.findOne({
      where: { user: { id: dto.userId }, company: { id: dto.companyId } },
      relations: ['user', 'company', 'role'],
    });

    if (userHasCompany) {
      userHasCompany.company = company;
      userHasCompany.role = role;
      userHasCompany.isOwner = dto.isOwner ?? userHasCompany.isOwner;
    } else {
      userHasCompany = this.userHasCompanyRepository.create({
        user,
        company,
        role,
        isOwner: dto.isOwner ?? false,
      });
    }

    const saved = await this.userHasCompanyRepository.save(userHasCompany);
    const result = instanceToPlain(saved);
    delete result.user?.password;
    return { message: await this.i18n.translate('company_updated', lang), data: result };
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
        // Formater le numéro si nécessaire
        await this.smsService.sendSms(user.phone, statusMessage).catch(err => {
          // Log l'erreur mais ne pas bloquer la mise à jour
          console.error(`Erreur envoi SMS à ${user.phone}:`, err.message);
        });
      }
    }

    return {
      message: await this.i18n.translate('company_status_updated', lang),
      data: updatedCompany,
    };
  }

  // ======================== FIND BY TYPE ========================
  async findByType(
    type?: string,
    lang: string = 'fr',
  ): Promise<{ message: string; data: CompanyEntity[] }> {
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
      .orderBy('company.createdAt', 'DESC');

    if (type) query.where('company.typeCompany = :type', { type });
    const companies = await query.getMany();
    if (!companies.length) {
      throw new NotFoundException(
        await this.i18n.translate('company_not_found', lang),
      );
    }
    return { message: await this.i18n.translate('company_created', lang), data: companies };
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

    const result = {
      ...company,
      companyResources,
      userHasCompany,
      resources,
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

    return {
      data: {
        ...company,
        companyResources,
        userHasCompany,
        resources,
        products,
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
        'userHasCompany.company',
        'userHasCompany.company.country',
        'userHasCompany.company.city',
        'userHasCompany.company.category',
        'userHasCompany.company.branches',
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

        return {
          ...companyWithoutResources,
          products,
          categories,
          companyResources: transformedResources,
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

  async createCity(dto: CreateCityDto, lang: string = 'fr'): Promise<City> {
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
    const city = this.cityRepo.create({ name: dto.name, country, tarif: dto.tarif ?? null });
    return await this.cityRepo.save(city);
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

  async updateCity(id: string, dto: Partial<CreateCityDto>, lang: string = 'fr') {
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

    if (dto.tarif !== undefined) {
      // Si null ou undefined, on supprime le tarif
      if (dto.tarif === null) {
        city.tarif = null;
      } else {
        // Sinon on met à jour avec le nouveau JSON
        city.tarif = dto.tarif;
      }
    }
    const updated = await this.cityRepo.save(city);
    return { message: await this.i18n.translate('company_city_updated', lang), data: updated };
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
      .where('resource.name = :resourceName', { resourceName: 'SHIPPING' })
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
    console.log('=== setUserCompanyPermissions appelé ===');
    console.log('DTO reçu:', JSON.stringify(dto, null, 2));

    const { companyId, userId, branchId, permissions } = dto;

    // 🔥 Vérifier que branchId est fourni
    if (!branchId) {
      throw new BadRequestException('La branche est requise');
    }

    // Vérifier que des permissions sont fournies
    if (!permissions || permissions.length === 0) {
      throw new BadRequestException('Aucune permission fournie');
    }

    // 🔥 1. VÉRIFIER L'UTILISATEUR
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['activeCompany', 'activeBranch']
    });
    if (!user) {
      throw new NotFoundException(await this.i18n.translate('user_not_found', lang));
    }
    console.log('✅ Utilisateur trouvé:', user.id);

    // 🔥 2. VÉRIFIER L'ENTREPRISE
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException(await this.i18n.translate('company_not_found', lang));
    }
    console.log('✅ Entreprise trouvée:', company.id);

    // 🔥 3. VÉRIFIER LA BRANCHE
    const branch = await this.branchRepo.findOne({
      where: { id: branchId, company_id: companyId },
      relations: ['city', 'country']
    });
    if (!branch) {
      throw new BadRequestException(
        await this.i18n.translate('company_invalid_branch', lang),
      );
    }
    console.log('✅ Branche trouvée:', branch.id);

    // 🔥 4. VÉRIFIER OU CRÉER user_has_company
    let userCompany = await this.userHasCompanyRepository.findOne({
      where: {
        user: { id: userId },
        company: { id: companyId }
      },
    });

    if (!userCompany) {
      userCompany = this.userHasCompanyRepository.create({
        user: user,
        company: company,
        isOwner: false,
      });
      userCompany = await this.userHasCompanyRepository.save(userCompany);
      console.log('✅ user_has_company créé:', userCompany.id);
    } else {
      console.log('✅ user_has_company existant:', userCompany.id);
    }

    // 🔥 5. METTRE À JOUR activeCompanyId ET activeBranchId DANS L'UTILISATEUR
    let updated = false;

    // Mettre à jour activeCompanyId si différent
    if (user.activeCompanyId !== companyId) {
      user.activeCompanyId = companyId;
      user.activeCompany = company;
      updated = true;
      console.log(`✅ activeCompanyId mis à jour: ${companyId}`);
    }

    // Mettre à jour activeBranchId si différent
    if (user.activeBranchId !== branchId) {
      user.activeBranchId = branchId;
      user.activeBranch = branch;
      updated = true;
      console.log(`✅ activeBranchId mis à jour: ${branchId}`);
    }

    // Sauvegarder l'utilisateur si des changements ont été faits
    if (updated) {
      await this.userRepository.save(user);
      console.log('✅ Utilisateur mis à jour avec succès');
    } else {
      console.log('✅ Aucune mise à jour nécessaire pour l\'utilisateur');
    }

    // 🔥 6. SUPPRIMER LES ANCIENNES PERMISSIONS POUR CETTE BRANCHE
    const deleteResult = await this.companyUserResourceRepo.delete({
      userCompanyId: userCompany.id,
      branchId: branchId,
    });
    console.log(`🗑️ Anciennes permissions supprimées: ${deleteResult.affected || 0} lignes`);

    // 🔥 7. INSÉRER LES NOUVELLES PERMISSIONS
    const insertedPermissions: PermissionResponseDto[] = [];

    for (const perm of permissions) {
      try {
        console.log(`➡️ Insertion permission pour resourceId: ${perm.resourceId}`);

        const newPermission = this.companyUserResourceRepo.create({
          id: uuidv4(),
          userCompanyId: userCompany.id,
          resourceId: perm.resourceId,
          branchId: branchId,
          canRead: perm.canRead ?? false,
          canCreate: perm.canCreate ?? false,
          canUpdate: perm.canUpdate ?? false,
          canDelete: perm.canDelete ?? false,
          canManage: perm.canManage ?? false,
          status: perm.status ?? true,
        });

        const saved = await this.companyUserResourceRepo.save(newPermission);
        console.log(`✅ Permission insérée: ${saved.id}`);

        insertedPermissions.push({
          resourceId: saved.resourceId,
          canRead: saved.canRead,
          canCreate: saved.canCreate,
          canUpdate: saved.canUpdate,
          canDelete: saved.canDelete,
          canManage: saved.canManage,
          status: saved.status,
        });
      } catch (error) {
        console.error(
          `❌ Échec insertion pour resource ${perm.resourceId}:`,
          error.message,
        );
        throw new InternalServerErrorException(
          await this.i18n.translate('company_permissions_update_failed', lang),
        );
      }
    }

    console.log(`🎉 ${permissions.length} permissions enregistrées avec succès`);
    console.log(`🎉 activeCompanyId: ${user.activeCompanyId}, activeBranchId: ${user.activeBranchId}`);

    // 🔥 8. RETOURNER LA RÉPONSE
    return {
      message: await this.i18n.translate('company_permissions_updated', lang),
      data: {
        userId: user.id,
        companyId: user.activeCompanyId || companyId,
        branchId: user.activeBranchId || branchId,
        branchName: branch.name,
        permissionsCount: permissions.length,
        permissions: insertedPermissions
      }
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
    const activeCompanyId = currentUser.activeCompanyId;
    if (!activeCompanyId) {
      throw new BadRequestException(
        await this.i18n.translate('company_no_active', lang),
      );
    }

    const targetUser = await this.userRepository.findOne({
      where: { email: dto.email },
      relations: ['userHasCompany', 'userHasCompany.company'],
    });
    if (!targetUser) {
      throw new NotFoundException(
        await this.i18n.translate('company_not_found', lang),
      );
    }

    let targetBranchId: string | undefined = undefined;
    if (dto.branchId) {
      const branch = await this.branchRepo.findOne({
        where: { id: dto.branchId, company_id: activeCompanyId },
      });
      if (!branch) {
        throw new BadRequestException(
          await this.i18n.translate('company_invalid_branch', lang),
        );
      }
      targetBranchId = branch.id;
    }

    let userHasCompany = await this.userHasCompanyRepository.findOne({
      where: { user: { id: targetUser.id }, company: { id: activeCompanyId } },
    });

    if (userHasCompany) {
      // Déjà associé → on ne fait rien (pas de réassignation)
      return {
        message: await this.i18n.translate('company_updated', lang),
        data: null,
      };
    }

    // Création de la relation user ↔ company
    userHasCompany = this.userHasCompanyRepository.create({
      user: targetUser,
      company: { id: activeCompanyId } as any,
      isOwner: false,
      branchId: targetBranchId,
    });
    await this.userHasCompanyRepository.save(userHasCompany);

    // Déterminer la branche à utiliser pour les permissions
    let targetBranch: BranchEntity;
    if (dto.branchId) {
      const branch = await this.branchRepo.findOne({
        where: { id: dto.branchId, company_id: activeCompanyId },
      });
      if (!branch) {
        throw new BadRequestException(await this.i18n.translate('company_invalid_branch', lang));
      }
      targetBranch = branch;
    } else {
      const branch = await this.branchRepo.findOne({
        where: { company_id: activeCompanyId },
        order: { createdAt: 'ASC' },
      });
      if (!branch) {
        throw new NotFoundException(
          await this.i18n.translate('company_not_found', lang),
        );
      }
      targetBranch = branch;
    }

    // Mettre à jour activeCompanyId de l'utilisateur cible
    if (targetUser.activeCompanyId !== activeCompanyId) {
      targetUser.activeCompanyId = activeCompanyId;
      await this.userRepository.save(targetUser);
    }

    // ------------------------------------------------------------
    // CHANGER LE RÔLE DE L'UTILISATEUR EN ADMIN (sauf s'il est déjà SUPER_ADMIN)
    // ------------------------------------------------------------
    if (targetUser.role !== UserRole.SUPER_ADMIN && targetUser.role !== UserRole.ADMIN) {
      targetUser.role = UserRole.ADMIN;
      await this.userRepository.save(targetUser);
    }

    // ------------------------------------------------------------
    // ATTRIBUER TOUTES LES PERMISSIONS (TOUS LES DROITS À TRUE)
    // SUR TOUTES LES RESSOURCES DISPONIBLES
    // ------------------------------------------------------------
    const allResources = await this.resourceRepo.find();
    // Supprimer les anciennes permissions éventuelles (normalement aucune, mais par sécurité)
    await this.companyUserResourceRepo.delete({ userCompanyId: userHasCompany.id });

    for (const resource of allResources) {
      const newPerm = this.companyUserResourceRepo.create({
        id: uuidv4(),
        userCompanyId: userHasCompany.id,
        resourceId: resource.id,
        branchId: targetBranch.id,
        canCreate: true,
        canRead: true,
        canUpdate: true,
        canDelete: true,
        canManage: true,
        status: true,
      });
      await this.companyUserResourceRepo.save(newPerm);
    }

    const { password, ...userWithoutPassword } = targetUser;
    return {
      message: await this.i18n.translate('company_updated', lang),
      data: userWithoutPassword,
    };
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

    return {
      id: userHasCompany.id,
      createdAt: userHasCompany.createdAt,
      updatedAt: userHasCompany.updatedAt,
      user: userWithoutPassword,
      isOwner: userHasCompany.isOwner,
      branch: mainBranch,
      permissions,
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
    if (!userHasCompany) {
      throw new NotFoundException(await this.i18n.translate('company_not_found', lang));
    }
    if (userHasCompany.company.id !== activeCompanyId) {
      throw new ForbiddenException(
        await this.i18n.translate('company_not_authorized', lang),
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
            await this.i18n.translate('company_not_found', lang),
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
}