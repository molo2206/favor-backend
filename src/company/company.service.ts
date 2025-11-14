import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateCompanyDto } from './dto/create-company.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { CompanyEntity } from './entities/company.entity';
import { Repository } from 'typeorm';
import { UserHasCompanyEntity } from 'src/user_has_company/entities/user_has_company.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { RoleUser } from 'src/role_user/entities/role_user.entity';
import { CreateUserHasCompanyDto } from 'src/user_has_company/dto/create-user_has_company.dto';
import { instanceToPlain } from 'class-transformer';
import { TypeCompany } from 'src/type_company/entities/type_company.entity';
import { CloudinaryService } from 'src/users/utility/helpers/cloudinary.service';
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
import { CreateCompanyAdminDto } from './dto/create-company-admin.dto';
import { UserPlatformRoleEntity } from 'src/users/entities/user_plateform_roles.entity';
import { NotificationsService } from 'src/notification/notifications.service';
import { UserRole } from 'src/users/enum/user-role-enum';

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

    @InjectRepository(TypeCompany) // Ajout de l'injection du repository TypeCompany
    private readonly typeCompanyRepository: Repository<TypeCompany>, // Définition de la propriété

    @InjectRepository(TauxCompany)
    private readonly tauxCompanyRepository: Repository<TauxCompany>,

    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,

    @InjectRepository(Service)
    private readonly serviceRepo: Repository<Service>,

    @InjectRepository(OrderEntity)
    private readonly orderRepo: Repository<OrderEntity>,

    @InjectRepository(Country)
    private countryRepo: Repository<Country>,
    @InjectRepository(City)
    private cityRepo: Repository<City>,

    @InjectRepository(UserPlatformRoleEntity)
    private readonly userPlatformRoleRepo: Repository<UserPlatformRoleEntity>,

    private readonly notificationsService: NotificationsService,

    private readonly cloudinary: CloudinaryService,
    private readonly mailService: MailService,
    private readonly smsHelper: SmsHelper,
  ) {}

  // services/company.service.ts
  async createCompanyWithUser(
    dto: CreateCompanyDto,
    user: UserEntity,
    logoFile?: Express.Multer.File,
    bannerFile?: Express.Multer.File,
  ): Promise<{ message: string; data: any }> {
    if (!dto || Object.keys(dto).length === 0) {
      throw new BadRequestException('Les données de l’entreprise sont requises');
    }

    if (!dto.companyName || dto.companyName.trim() === '') {
      throw new BadRequestException('Le nom de l’entreprise est obligatoire');
    }

    // Upload logo et banner
    const logoUrl = logoFile
      ? await this.cloudinary.handleUploadImage(logoFile, 'company')
      : null;
    const bannerUrl = bannerFile
      ? await this.cloudinary.handleUploadImage(bannerFile, 'company/banner')
      : null;

    // Création de la company avec country et city si fournis
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
    });

    const savedCompany = await this.companyRepository.save(company);

    // Lier la company au user
    const userHasCompany = this.userHasCompanyRepository.create({
      user,
      company: savedCompany,
      isOwner: true,
    });
    await this.userHasCompanyRepository.save(userHasCompany);

    user.activeCompany = savedCompany;
    user.activeCompanyId = savedCompany.id;
    await this.userRepository.save(user);

    // Récupérer le user complet avec relations pour retour
    const fullUser = await this.userRepository.findOne({
      where: { id: user.id },
      relations: [
        'activeCompany',
        'activeCompany.country',
        'activeCompany.city',
        'userHasCompany.company',
      ],
    });

    // Créer le taux initial
    const defaultTaux = this.tauxCompanyRepository.create({
      name: 'Taux initial de la société',
      value: dto.taux || 0,
      currency: 'CDF',
      isActive: true,
      company: savedCompany,
    });
    await this.tauxCompanyRepository.save(defaultTaux);

    // ✅ Envoi de notification selon contact disponible
    const hasEmail = !!user.email && user.email.includes('@');
    const hasPhone = !!user.phone;

    if (!hasEmail && !hasPhone) {
      console.warn(
        `Aucun moyen de contact disponible pour l'entreprise ${savedCompany.companyName}`,
      );
    }

    const message = `Bonjour ${user.fullName}, votre entreprise "${savedCompany.companyName}" a été créée avec succès sur FavorHelp. Elle est en attente de vérification.`;

    // ✅ Vérification avant tout envoi d’email
    if (hasEmail) {
      try {
        await this.mailService.sendHtmlEmail(
          user.email,
          'Votre entreprise a été créée avec succès',
          'company-status-update.html',
          { companyName: dto.companyName, status: 'PENDING', year: new Date().getFullYear() },
        );
        console.log(`✅ Email envoyé à ${user.email}`);
      } catch (error) {
        console.error(`❌ Erreur lors de l’envoi d’email à ${user.email}:`, error);
      }
    } else {
      console.warn(`⚠️ Aucun email valide pour ${user.fullName}, email ignoré.`);
    }

    if (hasPhone) {
      await this.smsHelper.sendSms(user.phone, message);
    }

    const platformUsers = await this.userPlatformRoleRepo.find({
      where: { platform: { key: savedCompany.typeCompany } },
      relations: ['user'],
    });

    const superAdmins = await this.userRepository.find({
      where: { role: UserRole.SUPER_ADMIN },
    });

    const allRecipients = [...platformUsers.map((p) => p.user), ...superAdmins].filter(
      (usr, index, self) => index === self.findIndex((u) => u.id === usr.id),
    );

    for (const recipient of allRecipients) {
      await this.notificationsService.sendNotificationToUser(
        recipient.id,
        'Nouvelle entreprise créée avec succès',
        `Une nouvelle entreprise (${savedCompany.companyName ?? savedCompany.id}) vient d’être enregistrée.`,
        'COMPANY' as any,
        savedCompany,
      );
    }

    return {
      message: 'Entreprise créée avec succès.',
      data: fullUser!,
    };
  }

  async updateCompanyWithUser(
    dto: Partial<CreateCompanyDto>,
    current_user: UserEntity,
    logoFile?: Express.Multer.File,
    bannerFile?: Express.Multer.File,
  ): Promise<{ message: string; data: CompanyEntity }> {
    if (!dto || Object.keys(dto).length === 0) {
      throw new BadRequestException("Les données de l'entreprise ne peuvent pas être vides");
    }

    const company = await this.companyRepository.findOne({
      where: { id: current_user.activeCompanyId },
      relations: ['country', 'city'],
    });

    if (!company) {
      throw new NotFoundException(
        `Entreprise avec l'ID ${current_user.activeCompanyId} introuvable`,
      );
    }

    // 🔸 Mise à jour dynamique
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
    ];

    for (const field of fieldsToUpdate) {
      const value = dto[field];
      if (value !== undefined && value !== null && value !== '') {
        (company as any)[field] = value;
      }
    }

    // 🔸 Taux
    if (dto.taux !== undefined) {
      const taux = Number(dto.taux);
      if (!isNaN(taux)) company.taux = taux;
    }

    // 🔸 Devise locale
    if (dto.localCurrency !== undefined) {
      company.localCurrency = dto.localCurrency;
    }

    // 🔸 Upload des fichiers logo / bannière
    if (logoFile) {
      company.logo = await this.cloudinary.handleUploadImage(logoFile, 'company/logo');
    } else if (dto.logo) {
      company.logo = dto.logo;
    }

    if (bannerFile) {
      company.banner = await this.cloudinary.handleUploadImage(bannerFile, 'company/banner');
    } else if (dto.banner) {
      company.banner = dto.banner;
    }

    // 🔸 Type de compagnie
    if (
      dto.typeCompany &&
      Object.values(CompanyType).includes(dto.typeCompany as CompanyType)
    ) {
      company.typeCompany = dto.typeCompany as CompanyType;
    }

    // 🔸 Relations Country et City
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

    // ✅ Rechargement complet avec toutes les relations utiles
    const updatedCompany = await this.companyRepository.findOne({
      where: { id: company.id },
      relations: [
        'country',
        'city',
        'products',
        'userHasCompany',
        'userHasCompany.user',
        'userHasCompany.role',
        'userHasCompany.permissions',
        'userHasCompany.permissions.permission',
        'services',
        'rooms',
        'tauxCompanies',
        'measures',
      ],
    });

    if (!updatedCompany) {
      throw new NotFoundException('Erreur lors du rechargement de l’entreprise mise à jour.');
    }
    return {
      message: 'Companie mise à jour avec succès',
      data: updatedCompany,
    };
  }
  async createCompanyWithUserAdmin(
    dto: CreateCompanyAdminDto,
    logoFile?: Express.Multer.File,
    bannerFile?: Express.Multer.File,
  ): Promise<{ message: string; data: any }> {
    if (!dto || Object.keys(dto).length === 0) {
      throw new BadRequestException('Les données de l’entreprise sont requises');
    }

    if (!dto.companyName || dto.companyName.trim() === '') {
      throw new BadRequestException('Le nom de l’entreprise est obligatoire');
    }

    // Upload logo et banner
    const logoUrl = logoFile
      ? await this.cloudinary.handleUploadImage(logoFile, 'company')
      : null;
    const bannerUrl = bannerFile
      ? await this.cloudinary.handleUploadImage(bannerFile, 'company/banner')
      : null;
    const user = await this.userRepository.findOne({ where: { id: dto.userId } });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }
    // Création de la company avec country et city si fournis
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
    });

    const savedCompany = await this.companyRepository.save(company);

    // Lier la company au user
    const userExist = await this.userRepository.findOne({ where: { id: dto.userId } });
    if (!userExist) {
      throw new NotFoundException('Utilisateur introuvable');
    }
    const userHasCompany = this.userHasCompanyRepository.create({
      user: userExist.id ? ({ id: userExist.id } as any) : null,
      company: savedCompany,
      isOwner: true,
    });
    await this.userHasCompanyRepository.save(userHasCompany);

    user.activeCompany = savedCompany;
    user.activeCompanyId = savedCompany.id;
    await this.userRepository.save(user);

    const fullUser = await this.userRepository.findOne({
      where: { id: user.id },
      relations: [
        'activeCompany',
        'activeCompany.country',
        'activeCompany.city',
        'userHasCompany.company',
      ],
    });

    // Créer le taux initial
    const defaultTaux = this.tauxCompanyRepository.create({
      name: 'Taux initial de la société',
      value: dto.taux || 0,
      currency: 'CDF',
      isActive: true,
      company: savedCompany,
    });
    await this.tauxCompanyRepository.save(defaultTaux);

    // ✅ Envoi de notification selon contact disponible
    const hasEmail = user.email;
    const hasPhone = user.phone;

    if (!hasEmail && !hasPhone) {
      console.warn(
        `Aucun moyen de contact disponible pour l'entreprise ${savedCompany.companyName}`,
      );
    }
    const message = `Bonjour ${user.fullName}, votre entreprise "${savedCompany.companyName}" a été créée avec succès sur FavorHelp. Elle est en attente de vérification.`;

    if (hasEmail) {
      await this.mailService.sendHtmlEmail(
        user.email,
        'Votre entreprise a été créée avec succès',
        'company-status-update.html',
        { companyName: dto.companyName, status: 'VALIDATED', year: new Date().getFullYear() },
      );
    }
    if (hasPhone) {
      await this.smsHelper.sendSms(user.phone, message);
    }

    return {
      message: 'Entreprise créée avec succès.',
      data: fullUser!,
    };
  }

  async updateCompanyWithUserAdmin(
    id: string,
    dto: Partial<CreateCompanyAdminDto>,
    logoFile?: Express.Multer.File,
    bannerFile?: Express.Multer.File,
  ): Promise<{ message: string; data: CompanyEntity }> {
    if (!dto || Object.keys(dto).length === 0) {
      throw new BadRequestException("Les données de l'entreprise ne peuvent pas être vides");
    }

    const user = await this.userRepository.findOne({ where: { id: dto.userId } });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    const company = await this.companyRepository.findOne({
      where: { id: id },
      relations: ['country', 'city'],
    });

    if (!company) {
      throw new NotFoundException(`Entreprise avec l'ID ${id} introuvable`);
    }

    // 🔸 Mise à jour dynamique
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
    ];

    for (const field of fieldsToUpdate) {
      const value = dto[field];
      if (value !== undefined && value !== null && value !== '') {
        (company as any)[field] = value;
      }
    }

    // 🔸 Taux
    if (dto.taux !== undefined) {
      const taux = Number(dto.taux);
      if (!isNaN(taux)) company.taux = taux;
    }

    // 🔸 Devise locale
    if (dto.localCurrency !== undefined) {
      company.localCurrency = dto.localCurrency;
    }

    // 🔸 Upload des fichiers logo / bannière
    if (logoFile) {
      company.logo = await this.cloudinary.handleUploadImage(logoFile, 'company/logo');
    } else if (dto.logo) {
      company.logo = dto.logo;
    }

    if (bannerFile) {
      company.banner = await this.cloudinary.handleUploadImage(bannerFile, 'company/banner');
    } else if (dto.banner) {
      company.banner = dto.banner;
    }

    // 🔸 Type de compagnie
    if (
      dto.typeCompany &&
      Object.values(CompanyType).includes(dto.typeCompany as CompanyType)
    ) {
      company.typeCompany = dto.typeCompany as CompanyType;
    }

    // 🔸 Relations Country et City
    if (dto.countryId) {
      company.country = { id: dto.countryId } as any;
    }
    if (dto.cityId) {
      company.city = { id: dto.cityId } as any;
    }

    if (dto.categoryId !== undefined) {
      if (dto.categoryId === null) {
        // Supprimer la catégorie
      } else {
        // Assigner une nouvelle catégorie
        company.category = { id: dto.categoryId } as any;
        company.categoryId = dto.categoryId;
      }
    }

    await this.companyRepository.save(company);

    // ✅ Rechargement complet avec toutes les relations utiles
    const updatedCompany = await this.companyRepository.findOne({
      where: { id: company.id },
      relations: [
        'country',
        'city',
        'products',
        'userHasCompany',
        'userHasCompany.user',
        'userHasCompany.role',
        'userHasCompany.permissions',
        'userHasCompany.permissions.permission',
        'services',
        'rooms',
        'tauxCompanies',
        'measures',
      ],
    });

    if (!updatedCompany) {
      throw new NotFoundException('Erreur lors du rechargement de l’entreprise mise à jour.');
    }
    return {
      message: 'Companie mise à jour avec succès',
      data: updatedCompany,
    };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async CreateUserToCompany(
    dto: CreateUserHasCompanyDto,
  ): Promise<{ message: string; data: any }> {
    // Retourne 'data' dans l'objet
    const user = await this.userRepository.findOneOrFail({ where: { id: dto.userId } });
    const company = await this.companyRepository.findOneOrFail({
      where: { id: dto.companyId },
    });
    const role = await this.roleRepository.findOneOrFail({ where: { id: dto.roleId } });

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

    return { message: 'Enregistrée avec succès', data: result }; // Encapsule la réponse dans un objet 'data'
  }

  async updateCompanyStatus(
    id: string,
    dto: UpdateCompanyStatusDto,
  ): Promise<{ data: CompanyEntity; message: string }> {
    const company = await this.companyRepository.findOne({ where: { id } });

    if (!company) {
      throw new NotFoundException('Entreprise non trouvée.');
    }

    // 🔄 Mettre à jour le statut
    company.status = dto.status;
    const updatedCompany = await this.companyRepository.save(company);

    // 🔹 Récupérer l'utilisateur lié (propriétaire ou associé)
    const userHasCompany = await this.userHasCompanyRepository.findOne({
      where: { company: { id: company.id } },
      relations: ['user'],
    });

    if (userHasCompany) {
      const user = userHasCompany.user;
      const { password, ...userWithoutPassword } = user;

      const hasEmail = !!user.email?.trim();
      const hasPhone = !!user.phone?.trim();

      const statusMessage = `Le statut de votre entreprise "${company.companyName}" a été mis à jour sur FavorHelp et est maintenant : ${company.status}.`;

      // ✉️ Envoyer un email si disponible
      if (hasEmail) {
        try {
          await this.mailService.sendHtmlEmail(
            user.email,
            'Mise à jour du statut de votre entreprise sur FavorHelp',
            'company-status-update.html',
            {
              user: userWithoutPassword,
              companyName: company.companyName,
              status: company.status,
              message: statusMessage,
              year: new Date().getFullYear(),
            },
          );
        } catch (err) {
          console.error('Erreur lors de l’envoi de l’email :', err);
        }
      }

      // 📱 Envoyer un SMS si disponible
      if (hasPhone) {
        try {
          const smsMessage = `Bonjour ${user.fullName}, ${statusMessage}`;
          await this.smsHelper.sendSms(user.phone, smsMessage);
        } catch (err) {
          console.error('Erreur lors de l’envoi du SMS :', err);
        }
      }
    }

    return {
      message: `Le statut de l'entreprise "${company.companyName}" a été mis à jour avec succès.`,
      data: updatedCompany,
    };
  }

  async findByType(type?: string): Promise<{ message: string; data: CompanyEntity[] }> {
    const query = this.companyRepository
      .createQueryBuilder('company')
      .leftJoinAndSelect('company.userHasCompany', 'userHasCompany')
      .leftJoinAndSelect('userHasCompany.user', 'user')
      .leftJoinAndSelect('userHasCompany.role', 'role')
      .leftJoinAndSelect('userHasCompany.permissions', 'permissions')
      .leftJoinAndSelect('permissions.permission', 'permission')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('company.city', 'city')
      .leftJoinAndSelect('company.category', 'category')
      .orderBy('company.companyName', 'ASC');

    if (type) {
      query.where('company.typeCompany = :type', { type });
    }

    query.orderBy('company.createdAt', 'DESC');

    const companies = await query.getMany();

    if (companies.length === 0) {
      throw new NotFoundException(
        `Aucune entreprise trouvée${type ? ` pour le type : ${type}` : ''}`,
      );
    }

    return {
      message: `Entreprises récupérées avec succès${type ? ` pour le type : ${type}` : ''}.`,
      data: companies,
    };
  }

  async getCompanyById(id: string): Promise<{ data: CompanyEntity }> {
    const company = await this.companyRepository.findOne({
      where: { id },
      relations: [
        'userHasCompany',
        'userHasCompany.user',
        'userHasCompany.role',
        'userHasCompany.permissions',
        'userHasCompany.permissions.permission',
        'country', // ajouté
        'city', // ajouté
        'category',
      ],
    });

    if (!company) {
      throw new NotFoundException(`Entreprise avec l'ID ${id} introuvable`);
    }

    return { data: company };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async findByCompany(companyId: string): Promise<{ data: any }> {
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      relations: ['country', 'city', 'category'], // ajouté
    });

    if (!company) {
      throw new NotFoundException(`Entreprise avec l'ID ${companyId} introuvable`);
    }

    const products = await this.companyRepository.find({
      where: { company: { id: companyId } } as any,
      relations: ['category', 'images'],
    });

    return {
      data: {
        ...company,
        products,
      },
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async setActiveCompany(userId: string, companyId: string): Promise<any> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    const company = await this.companyRepository.findOne({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException('Entreprise introuvable');
    }

    if (company.status !== CompanyStatus.VALIDATED) {
      throw new ForbiddenException("L'entreprise n'est pas validée.");
    }

    const userHasCompany = await this.userHasCompanyRepository.findOne({
      where: {
        user: { id: userId },
        company: { id: companyId },
      },
    });

    if (!userHasCompany) {
      throw new ForbiddenException("Cet utilisateur n'est pas lié à cette entreprise.");
    }

    user.activeCompany = company;
    user.activeCompanyId = company.id;
    await this.userRepository.save(user);

    // Charger l'utilisateur enrichi comme dans `signin`
    const enrichedUser = await this.userRepository
      .createQueryBuilder('users')
      .leftJoinAndSelect('users.userHasCompany', 'userHasCompany')
      .leftJoinAndSelect('userHasCompany.company', 'company')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('company.city', 'city')
      .leftJoinAndSelect('userHasCompany.permissions', 'permissions')
      .leftJoinAndSelect('permissions.permission', 'permission')
      .leftJoinAndSelect('company.category', 'category')
      .where('users.id = :id', { id: userId })
      .getOne();

    if (!enrichedUser) {
      throw new NotFoundException('Utilisateur enrichi introuvable après la mise à jour.');
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...userWithoutPassword } = enrichedUser;

    const userHasCompanyList =
      userWithoutPassword.userHasCompany?.map((uhc) => {
        const company = uhc.company
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
              categoryId: (uhc.company as any).category?.id || null, // ✅ ici
            }
          : null;

        return {
          id: uhc.id,
          isOwner: uhc.isOwner,
          company,
          permissions:
            uhc.permissions?.map((p) => ({
              id: p.permission?.id,
              name: p.permission?.name,
              create: p.create,
              read: p.read,
              update: p.update,
              delete: p.delete,
              status: p.status,
              createdAt: p.permission?.createdAt ? new Date(p.permission.createdAt) : null,
              updatedAt: p.permission?.updatedAt ? new Date(p.permission.updatedAt) : null,
            })) ?? [],
        };
      }) ?? [];

    const activeCompany = userHasCompanyList.find(
      (uhc) => uhc.company?.id === userWithoutPassword.activeCompanyId,
    )?.company;

    const activeCompanyWithCategory = activeCompany
      ? {
          ...activeCompany,
          categoryId: activeCompany.categoryId ?? null, // Ajout du categoryId
        }
      : null;

    return {
      message: 'Entreprise active définie avec succès.',
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
        activeCompany: activeCompanyWithCategory, // ✅ ici
      },
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async findAllByUser(userId: string): Promise<Record<string, any>> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: [
        'activeCompany',
        'activeCompany.country',
        'activeCompany.city',
        'userHasCompany.company',
        'userHasCompany.company.country',
        'userHasCompany.company.city',
        'userHasCompany.company.category',
      ],
    });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable.');
    }

    // Extraire les entreprises depuis les relations
    const companies =
      user.userHasCompany?.map((uhc) => ({
        ...uhc.company,
        country: uhc.company.country,
        city: uhc.company.city,
        category: uhc.company.category,
        role: uhc.role,
        permissions: uhc.permissions?.map((perm) => ({ ...perm.permission })),
        isOwner: uhc.isOwner,
      })) || [];

    const sanitizedUser = instanceToPlain(user);
    delete sanitizedUser.userHasCompany; // enlever si pas besoin brut

    return {
      ...sanitizedUser,
      companies,
    };
  }

  async findCompanyValidatedByType(
    type?: string,
    countryId?: string,
    cityId?: string,
    categoryId?: string, // ajout du filtre categoryId
    page = 1,
    limit = 10,
  ): Promise<{
    message: string;
    data: {
      data: CompanyEntity[];
      total: number;
      page: number;
      limit: number;
    };
  }> {
    const query = this.companyRepository
      .createQueryBuilder('company')
      .leftJoinAndSelect('company.userHasCompany', 'userHasCompany')
      .leftJoinAndSelect('userHasCompany.user', 'user')
      .leftJoinAndSelect('userHasCompany.role', 'role')
      .leftJoinAndSelect('userHasCompany.permissions', 'permissions')
      .leftJoinAndSelect('permissions.permission', 'permission')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('company.city', 'city')
      .leftJoinAndSelect('company.category', 'category') // inclure l'objet category complet
      .where('company.status = :status', { status: 'VALIDATED' })
      .orderBy('company.companyName', 'ASC');

    if (type) {
      query.andWhere('company.typeCompany = :type', { type });
    }

    if (countryId) {
      query.andWhere('company.countryId = :countryId', { countryId });
    }

    if (cityId) {
      query.andWhere('company.cityId = :cityId', { cityId });
    }

    if (categoryId) {
      query.andWhere('company.categoryId = :categoryId', { categoryId });
    }

    query.skip((page - 1) * limit).take(limit);

    const [companies, total] = await query.getManyAndCount();

    return {
      message:
        total > 0
          ? `Entreprises validées récupérées avec succès${
              type ? ` pour le type : ${type}` : ''
            }${countryId ? ` dans le pays : ${countryId}` : ''}${
              cityId ? ` et la ville : ${cityId}` : ''
            }${categoryId ? ` et la catégorie : ${categoryId}` : ''}.`
          : 'Aucune entreprise validée trouvée pour les critères donnés.',
      data: {
        data: companies.map((company) => ({
          ...company,
          category: company.category || null, // s'assurer que l'objet category est renvoyé
        })),
        total,
        page,
        limit,
      },
    };
  }

  async getCompanyDashboard(user: UserEntity, startDate?: string, endDate?: string) {
    const companyId = user.activeCompanyId;
    const company = await this.companyRepository.findOne({ where: { id: companyId } });

    if (!company) {
      throw new NotFoundException('Société introuvable');
    }

    // 📌 Filtre par période si startDate et endDate fournis
    let dateFilter: any = {};
    if (startDate && endDate) {
      const start = startOfDay(parseISO(startDate));
      const end = endOfDay(parseISO(endDate));
      dateFilter = { createdAt: Between(start, end) };
    }

    // 🛍️ Total produits
    const totalProducts = await this.productRepo.count({
      where: { company: { id: companyId }, ...dateFilter },
    });

    // 🧰 Total services
    const totalServices = await this.serviceRepo.count({
      where: { company: { id: companyId }, ...dateFilter },
    });

    // 👥 Total prestataires (distincts par service)
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

    // 🕒 Total commandes en attente
    const totalPendingOrders = await this.orderRepo.count({
      where: {
        status: OrderStatus.PENDING,
        subOrders: { company: { id: companyId } },
        ...dateFilter,
      },
    });

    // ✅ Total commandes livrées
    const totalDeliveredOrders = await this.orderRepo.count({
      where: {
        status: OrderStatus.DELIVERED,
        subOrders: { company: { id: companyId } },
        ...dateFilter,
      },
    });

    // 📅 Total commandes du jour
    const today = new Date();
    const totalTodayOrders = await this.orderRepo.count({
      where: {
        subOrders: { company: { id: companyId } },
        createdAt: Between(startOfDay(today), endOfDay(today)),
      },
    });

    return {
      message: 'Dashboard chargé avec succès',
      data: {
        companyId: company.id,
        companyName: company.companyName,
        totalProducts,
        totalServices,
        totalPrestataires,
        totalPendingOrders,
        totalDeliveredOrders,
        totalTodayOrders,
      },
    };
  }

  async createCountry(dto: CreateCountryDto): Promise<Country> {
    const country = this.countryRepo.create({ name: dto.name, code: dto.code });
    return await this.countryRepo.save(country);
  }

  async createCity(dto: CreateCityDto): Promise<City> {
    const country = await this.countryRepo.findOne({ where: { id: dto.countryId } });
    if (!country) {
      throw new NotFoundException(`Pays avec l'ID ${dto.countryId} introuvable`);
    }

    // Vérifier si la ville existe déjà pour ce pays
    const existingCity = await this.cityRepo.findOne({
      where: {
        name: dto.name,
        country: { id: dto.countryId },
      },
      relations: ['country'],
    });

    if (existingCity) {
      throw new BadRequestException(`La ville "${dto.name}" existe déjà pour ce pays.`);
    }

    const city = this.cityRepo.create({
      name: dto.name,
      country,
    });

    return await this.cityRepo.save(city);
  }

  // Country
  async updateCountry(id: string, dto: Partial<CreateCountryDto>) {
    const country = await this.countryRepo.findOne({ where: { id } });
    if (!country) {
      throw new NotFoundException(`Pays avec l'ID ${id} introuvable`);
    }

    if (dto.name && dto.name.trim() !== '') {
      country.name = dto.name;
    }

    if (dto.code && dto.code.trim() !== '') {
      country.code = dto.code; // 🔹 Ajouter cette ligne
    }

    const updated = await this.countryRepo.save(country);

    return {
      message: 'Pays mis à jour avec succès.',
      data: updated,
    };
  }

  // City
  async updateCity(id: string, dto: Partial<CreateCityDto>) {
    const city = await this.cityRepo.findOne({ where: { id }, relations: ['country'] });
    if (!city) {
      throw new NotFoundException(`Ville avec l'ID ${id} introuvable`);
    }

    if (dto.name && dto.name.trim() !== '') {
      const existingCity = await this.cityRepo.findOne({
        where: { name: dto.name, country: { id: city.country.id } },
        relations: ['country'],
      });

      if (existingCity && existingCity.id !== id) {
        throw new BadRequestException(`La ville "${dto.name}" existe déjà pour ce pays.`);
      }

      city.name = dto.name;
    }

    if (dto.countryId && dto.countryId !== city.country.id) {
      const newCountry = await this.countryRepo.findOne({ where: { id: dto.countryId } });
      if (!newCountry) {
        throw new NotFoundException(`Pays avec l'ID ${dto.countryId} introuvable`);
      }
      city.country = newCountry;
    }

    const updated = await this.cityRepo.save(city);

    return {
      message: 'Ville mise à jour avec succès.',
      data: updated,
    };
  }

  async getAllCountries(): Promise<Country[]> {
    return await this.countryRepo.find({ relations: ['cities'] });
  }

  // Récupérer toutes les villes actives
  async getAllCities(): Promise<City[]> {
    return await this.cityRepo.find({ relations: ['country'] });
  }

  // Récupérer toutes les villes d’un pays par ID
  async getCitiesByCountry(countryId: string): Promise<City[]> {
    const country = await this.countryRepo.findOne({ where: { id: countryId } });
    if (!country) throw new NotFoundException(`Pays avec l'ID ${countryId} introuvable`);

    return await this.cityRepo.find({ where: { countryId } });
  }

  async getCountryById(id: string): Promise<Country> {
    const country = await this.countryRepo.findOne({
      where: { id }, // seulement actif
      relations: ['cities'],
    });

    if (!country) {
      throw new NotFoundException(`Pays avec l'ID ${id} introuvable ou inactif`);
    }

    return country;
  }

  // Récupérer une ville par son id
  async getCityById(id: string): Promise<City> {
    const city = await this.cityRepo.findOne({
      where: { id }, // seulement actif
      relations: ['country'],
    });

    if (!city) {
      throw new NotFoundException(`Ville avec l'ID ${id} introuvable ou inactive`);
    }

    return city;
  }
  async toggleStatus(type: 'country' | 'city', id: string): Promise<Country | City> {
    if (type === 'country') {
      const country = await this.countryRepo.findOne({ where: { id } });
      if (!country) {
        throw new NotFoundException(`Pays avec l'ID ${id} introuvable`);
      }
      country.status = !country.status;
      return await this.countryRepo.save(country);
    }

    if (type === 'city') {
      const city = await this.cityRepo.findOne({ where: { id } });
      if (!city) {
        throw new NotFoundException(`Ville avec l'ID ${id} introuvable`);
      }
      city.status = !city.status;
      return await this.cityRepo.save(city);
    }

    throw new NotFoundException(`Type "${type}" invalide. Utilisez "country" ou "city".`);
  }
}
