import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';

import { Service } from './entities/service.entity';
import { CategoryEntity } from 'src/category/entities/category.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { CloudinaryService } from 'src/users/utility/helpers/cloudinary.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { ProductStatus } from 'src/products/enum/product.status.enum';
import { UpdateServiceStatusDto } from './enum/updateServiceStatusDto.enum';
import { PrestataireEntity } from './entities/prestataires.entity';
import { ServiceHasPrestataire } from './entities/service_has_prestataire.entity';
import { PrestataireRole } from './enum/prestataire-role.enum';
import { PrestataireType } from './enum/prestataire-type.enum';
import { CompanyType } from 'src/company/enum/type.company.enum';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { CreatePrestataireDto } from './dto/create-prestataire.dto';
import { CompanyStatus } from 'src/company/enum/company-status.enum';
import { UserWithCompanyStatus } from 'src/users/interfaces/user-with-company-status.interface';

@Injectable()
export class ServiceService {
  constructor(
    @InjectRepository(Service)
    private readonly serviceRepo: Repository<Service>,

    @InjectRepository(CategoryEntity)
    private readonly categoryRepo: Repository<CategoryEntity>,

    @InjectRepository(PrestataireEntity)
    private readonly prestataireRepo: Repository<PrestataireEntity>,

    @InjectRepository(ServiceHasPrestataire)
    private readonly shpRepo: Repository<ServiceHasPrestataire>,

    @InjectRepository(CompanyEntity)
    private readonly compRepo: Repository<CompanyEntity>,

    private readonly cloudinary: CloudinaryService,
  ) {}

  async create(
    dto: CreateServiceDto,
    files: Express.Multer.File[],
    user: UserWithCompanyStatus,
  ): Promise<{ message: string; data: Service }> {
    if (!user) throw new ForbiddenException('Utilisateur non authentifié');

    if (user.companyStatus !== CompanyStatus.VALIDATED) {
      throw new ForbiddenException(
        'Votre société n’est pas encore validée. Impossible de créer un service.',
      );
    }

    if (!files?.length || files.length > 4)
      throw new BadRequestException('Vous devez fournir entre 1 et 4 images');

    // Vérification de la catégorie
    const category = await this.categoryRepo.findOne({ where: { id: dto.categoryId } });
    if (!category) throw new NotFoundException('Catégorie non trouvée');

    // Vérification de la société active
    const company = await this.compRepo.findOne({ where: { id: user.activeCompanyId } });
    if (!company) throw new NotFoundException('Société active introuvable');

    if (company.typeCompany !== CompanyType.SERVICE) {
      throw new BadRequestException(
        'Votre société ne peut pas créer ce type de service, car elle n’est pas de type SERVICE',
      );
    }

    // Upload des images
    const uploadedUrls = await Promise.all(
      files.map((file) => this.cloudinary.handleUploadImage(file, 'service')),
    );

    // Création du service
    const service = this.serviceRepo.create({
      ...dto,
      category,
      companyId: company.id,
      images: uploadedUrls,
      status: ProductStatus.PENDING,
      price: dto.price,
      measureId: dto.measureId,
    });

    await this.serviceRepo.save(service);

    const created = await this.serviceRepo.findOne({
      where: { id: service.id },
      relations: ['company', 'category'],
    });

    if (!created) throw new NotFoundException('Service créé introuvable');

    return { message: 'Service créé avec succès', data: created };
  }

  async update(
    id: string,
    dto: UpdateServiceDto,
    files?: Express.Multer.File[],
  ): Promise<{ message: string; data: Service }> {
    const service = await this.serviceRepo.findOne({
      where: { id },
      relations: ['category', 'company'],
    });

    if (!service) throw new NotFoundException('Service introuvable');

    // Catégorie
    if (dto.categoryId) {
      const category = await this.categoryRepo.findOne({ where: { id: dto.categoryId } });
      if (!category) throw new NotFoundException('Catégorie non trouvée');
      service.category = category;
    }

    // Gestion des images
    if (files && files.length > 0) {
      if (files.length > 4) throw new BadRequestException('Maximum 4 images autorisées');
      const uploadedUrls = await Promise.all(
        files.map((file) => this.cloudinary.handleUploadImage(file, 'service')),
      );
      service.images = uploadedUrls; // transformer s'occupe de JSON.stringify
    } else if (dto.images && dto.images.length > 0) {
      service.images = dto.images;
    }

    // Mise à jour des autres champs
    const fieldsToUpdate = Object.entries(dto).reduce((acc, [key, value]) => {
      if (value !== undefined && key !== 'image' && key !== 'categoryId') {
        acc[key] = value;
      }
      return acc;
    }, {} as Partial<UpdateServiceDto>);

    Object.assign(service, fieldsToUpdate);

    await this.serviceRepo.save(service);

    const updated = await this.serviceRepo.findOne({
      where: { id: service.id },
      relations: ['company', 'category'],
    });

    if (!updated) throw new NotFoundException('Service mis à jour introuvable');

    return { message: 'Service mis à jour avec succès', data: updated };
  }

  async findAll(): Promise<{
    message: string;
    data: any[];
  }> {
    const services = await this.serviceRepo.find({
      relations: ['company', 'category', 'prestataires', 'measure', 'prestataires.prestataire'],
      order: { createdAt: 'DESC' },
    });

    return {
      message: 'Liste des services récupérée avec succès.',
      data: services,
    };
  }

  async findAllByCompany(
    page = 1,
    limit = 10,
    user: UserEntity,
  ): Promise<{
    message: string;
    data: { data: Service[]; total: number; page: number; limit: number };
  }> {
    const skip = (page - 1) * limit;

    const query = this.serviceRepo
      .createQueryBuilder('service')
      .leftJoinAndSelect('service.company', 'company')
      .leftJoinAndSelect('service.category', 'category')
      .leftJoinAndSelect('service.prestataires', 'shp')
      .leftJoinAndSelect('service.measure', 'measure')
      .leftJoinAndSelect('shp.prestataire', 'prestataire')
      .orderBy('service.createdAt', 'DESC');

    const companyId = user?.activeCompanyId;
    if (companyId) {
      query.where('service.companyId = :companyId', { companyId });
    }

    const [services, total] = await query.skip(skip).take(limit).getManyAndCount();

    return {
      message: 'Liste des services récupérée avec succès.',
      data: {
        data: services,
        total,
        page,
        limit,
      },
    };
  }

  async findOne(id: string): Promise<{ message: string; data: Service }> {
    const service = await this.serviceRepo.findOne({
      where: { id },
      relations: ['company', 'category', 'measure', 'prestataires', 'prestataires.prestataire'],
    });

    if (!service) throw new NotFoundException('Service introuvable');

    return { message: 'Service trouvé avec succès', data: service };
  }

  async updateStatus(
    id: string,
    dto: UpdateServiceStatusDto,
    user: UserEntity,
  ): Promise<{ message: string; data: Service }> {
    if (!user) throw new ForbiddenException("Vous n'êtes pas connecté");

    const service = await this.serviceRepo.findOne({ where: { id } });
    if (!service) throw new NotFoundException('Service non trouvé');

    service.status = dto.status;
    await this.serviceRepo.save(service);

    const updated = await this.serviceRepo.findOne({
      where: { id },
      relations: ['company', 'category', 'prestataires', 'prestataires.prestataire'],
    });

    if (!updated) throw new NotFoundException('Service mis à jour introuvable');

    return { message: 'Statut du service mis à jour avec succès', data: updated };
  }

  async assignPrestataireToService(
    serviceId: string,
    prestataireId: string,
    role?: PrestataireRole,
    tarif?: number,
    type?: PrestataireType,
  ): Promise<{ message: string }> {
    // Récupération simultanée
    const [service, prestataire] = await Promise.all([
      this.serviceRepo.findOne({ where: { id: serviceId } }),
      this.prestataireRepo.findOne({ where: { id: prestataireId } }),
    ]);

    if (!service) throw new NotFoundException('Service introuvable');
    if (!prestataire) throw new NotFoundException('Prestataire introuvable');

    // Vérifie si le prestataire est déjà assigné
    const existing = await this.shpRepo.findOne({ where: { serviceId, prestataireId } });
    if (existing) throw new BadRequestException('Ce prestataire est déjà assigné à ce service');

    // Crée le lien en utilisant les enums et le tarif decimal
    const link = this.shpRepo.create({
      serviceId,
      prestataireId,
      tarif: tarif ?? undefined,
      actif: true,
    });

    await this.shpRepo.save(link);

    await this.shpRepo.save(link);

    return { message: 'Prestataire associé au service avec succès' };
  }

  async removePrestataireFromService(
    serviceId: string,
    prestataireId: string,
  ): Promise<{ message: string }> {
    const link = await this.shpRepo.findOne({ where: { serviceId, prestataireId } });
    if (!link) throw new NotFoundException('Association non trouvée');

    await this.shpRepo.remove(link);
    return { message: 'Prestataire retiré du service avec succès' };
  }

  async getPrestatairesByService(serviceId: string) {
    const service = await this.serviceRepo.findOne({
      where: { id: serviceId },
      relations: ['prestataires', 'prestataires.prestataire'],
    });
    if (!service) throw new NotFoundException('Service introuvable');

    const data = service.prestataires.map((link) => ({
      id: link.prestataire.id,
      full_name: link.prestataire.full_name,
      email: link.prestataire.email,
      tarif: link.tarif,
      actif: link.actif,
    }));

    return { message: `Prestataires du service ${service.name}`, data };
  }

  async getServicesByPrestataire(prestataireId: string) {
    const prestataire = await this.prestataireRepo.findOne({
      where: { id: prestataireId },
      relations: ['services', 'services.service'],
    });
    if (!prestataire) throw new NotFoundException('Prestataire introuvable');

    const data = prestataire.services.map((link) => ({
      id: link.service.id,
      name: link.service.name,
      description: link.service.description,
      tarif: link.tarif,
      actif: link.actif,
    }));

    return {
      message: `Services du prestataire ${prestataire.full_name}`,
      data,
    };
  }

  async remove(id: string): Promise<{ message: string }> {
    const service = await this.serviceRepo.findOne({ where: { id } });
    if (!service) throw new NotFoundException('Service non trouvé');

    await this.serviceRepo.remove(service);
    return { message: 'Service supprimé avec succès' };
  }

  // Service
  // CREATE
  async createPrestataire(
    dto: CreatePrestataireDto & { serviceIds?: string[] },
    file?: Express.Multer.File,
  ): Promise<{ message: string; data: PrestataireEntity }> {
    // Vérifier doublons email et téléphone
    if (dto.email) {
      const existingEmail = await this.prestataireRepo.findOne({ where: { email: dto.email } });
      if (existingEmail)
        throw new BadRequestException('Un prestataire avec cet email existe déjà');
    }
    if (dto.phone) {
      const existingPhone = await this.prestataireRepo.findOne({ where: { phone: dto.phone } });
      if (existingPhone)
        throw new BadRequestException('Un prestataire avec ce téléphone existe déjà');
    }

    // Upload photo
    const photo = file
      ? await this.cloudinary.handleUploadImage(file, 'prestataires')
      : undefined;

    // Créer le prestataire
    const prestataire = this.prestataireRepo.create({
      full_name: dto.full_name, // correspond exactement à ton entité
      email: dto.email,
      phone: dto.phone,
      description: dto.description,
      photo,
      experience: dto.experience || null,
      competence: dto.competence || null,
      specialite: dto.specialite || null,
    } as DeepPartial<PrestataireEntity>); // ⚡ cast pour TypeScript

    await this.prestataireRepo.save(prestataire);

    // Gestion des services
    if (dto.serviceIds) {
      if (typeof dto.serviceIds === 'string') dto.serviceIds = JSON.parse(dto.serviceIds);
      if (Array.isArray(dto.serviceIds) && dto.serviceIds.length > 0) {
        const validServices = await this.serviceRepo.findByIds(dto.serviceIds);
        const serviceLinks = validServices.map((s) =>
          this.shpRepo.create({ prestataireId: prestataire.id, serviceId: s.id, actif: true }),
        );
        if (serviceLinks.length > 0) await this.shpRepo.save(serviceLinks);
      }
    }

    // Recharger avec relations
    const savedPrestataire = await this.prestataireRepo.findOne({
      where: { id: prestataire.id },
      relations: ['services', 'services.service'],
    });

    if (!savedPrestataire) throw new NotFoundException('Prestataire créé introuvable');

    return { message: 'Prestataire créé avec succès', data: savedPrestataire };
  }

  async updatePrestataire(
    id: string,
    dto: Partial<CreatePrestataireDto> & { serviceIds?: string[] },
    file?: Express.Multer.File,
  ): Promise<{ message: string; data: PrestataireEntity }> {
    const prestataire = await this.prestataireRepo.findOne({ where: { id } });
    if (!prestataire) throw new NotFoundException('Prestataire introuvable');

    // Vérifier doublons
    if (dto.email && dto.email !== prestataire.email) {
      const existingEmail = await this.prestataireRepo.findOne({ where: { email: dto.email } });
      if (existingEmail)
        throw new BadRequestException('Un prestataire avec cet email existe déjà');
    }
    if (dto.phone && dto.phone !== prestataire.phone) {
      const existingPhone = await this.prestataireRepo.findOne({ where: { phone: dto.phone } });
      if (existingPhone)
        throw new BadRequestException('Un prestataire avec ce téléphone existe déjà');
    }

    // Mettre à jour la photo
    if (file) {
      prestataire.photo = await this.cloudinary.handleUploadImage(file, 'prestataires');
    }

    // Mettre à jour les champs simples
    Object.entries(dto).forEach(([key, value]) => {
      if (value !== undefined && key !== 'photo' && key !== 'serviceIds') {
        (prestataire as any)[key] = value;
      }
    });

    // Assurer que chaque champ reste texte simple
    if (dto.experience !== undefined) prestataire.experience = dto.experience;
    if (dto.competence !== undefined) prestataire.competence = dto.competence;
    if (dto.specialite !== undefined) prestataire.specialite = dto.specialite;

    await this.prestataireRepo.save(prestataire);

    // Mettre à jour les services
    if (dto.serviceIds) {
      if (typeof dto.serviceIds === 'string') dto.serviceIds = JSON.parse(dto.serviceIds);
      if (Array.isArray(dto.serviceIds)) {
        await this.shpRepo.delete({ prestataireId: prestataire.id });
        const validServices = await this.serviceRepo.findByIds(dto.serviceIds);
        const serviceLinks = validServices.map((s) =>
          this.shpRepo.create({ prestataireId: prestataire.id, serviceId: s.id, actif: true }),
        );
        if (serviceLinks.length > 0) await this.shpRepo.save(serviceLinks);
      }
    }

    const updatedPrestataire = await this.prestataireRepo.findOne({
      where: { id: prestataire.id },
      relations: ['services', 'services.service'],
    });

    if (!updatedPrestataire) throw new NotFoundException('Prestataire mis à jour introuvable');

    return { message: 'Prestataire mis à jour avec succès', data: updatedPrestataire };
  }

  async findPublished(
    categoryId?: string,
    countryId?: string,
    cityId?: string,
    page = 1,
    limit = 10,
  ): Promise<{
    message: string;
    data: { data: any[]; total: number; page: number; limit: number };
  }> {
    const skip = (page - 1) * limit;

    const query = this.serviceRepo
      .createQueryBuilder('service')
      .leftJoinAndSelect('service.company', 'company')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('company.city', 'city')
      .leftJoinAndSelect('service.category', 'category')
      .leftJoinAndSelect('service.prestataires', 'shp')
      .leftJoinAndSelect('service.measure', 'measure')
      .leftJoinAndSelect('shp.prestataire', 'prestataire')
      .where('service.status = :status', { status: ProductStatus.PUBLISHED })
      .orderBy('service.createdAt', 'DESC');

    if (categoryId) {
      query.andWhere('service.categoryId = :categoryId', { categoryId });
    }

    if (countryId) {
      query.andWhere('company.countryId = :countryId', { countryId });
    }

    if (cityId) {
      query.andWhere('company.cityId = :cityId', { cityId });
    }

    const [services, total] = await query.skip(skip).take(limit).getManyAndCount();

    const groupedByCompany = Object.values(
      services.reduce(
        (acc, service) => {
          const companyId = service.company.id;

          if (!acc[companyId]) {
            acc[companyId] = { ...service.company, services: [] };
          }

          const { company, ...serviceWithoutCompany } = service;
          acc[companyId].services.push(serviceWithoutCompany);

          return acc;
        },
        {} as Record<string, any>,
      ),
    );

    return {
      message: 'Liste des services publiés récupérée avec succès',
      data: {
        data: groupedByCompany,
        total,
        page,
        limit,
      },
    };
  }

  async findPrestatairesByCompany(user: UserEntity) {
    const companyId = user.activeCompanyId;
    if (!companyId) throw new BadRequestException("L'utilisateur n'a pas de société active");

    // 🔹 Trouver d'abord les services de la company
    const services = await this.serviceRepo.find({
      where: { company: { id: companyId } },
      relations: ['prestataires', 'prestataires.prestataire', 'category'],
    });

    // 🔹 Extraire tous les prestataires uniques
    const prestatairesMap = new Map();

    services.forEach((service) => {
      service.prestataires.forEach((ps) => {
        if (ps.prestataire && !prestatairesMap.has(ps.prestataire.id)) {
          prestatairesMap.set(ps.prestataire.id, {
            ...ps.prestataire,
            services: [], // Initialiser le tableau des services
          });
        }

        // Ajouter le service au prestataire
        if (ps.prestataire) {
          const prestataire = prestatairesMap.get(ps.prestataire.id);
          prestataire.services.push({
            service: {
              id: service.id,
              name: service.name,
              category: service.category,
            },
          });
        }
      });
    });

    const prestataires = Array.from(prestatairesMap.values());

    return {
      message: 'Prestataires récupérés avec succès',
      count: prestataires.length,
      data: prestataires,
    };
  }

  async findServicesByCompanyPublished(user: UserEntity) {
    const companyId = user.activeCompanyId;
    if (!companyId) throw new BadRequestException("L'utilisateur n'a pas de société active");

    console.log('🔍 DEBUG findServicesByCompanyPublished');
    console.log('Company ID:', companyId);

    try {
      // 🔹 REQUÊTE DIRECTE POUR LES SERVICES PUBLIÉS
      const services = await this.serviceRepo
        .createQueryBuilder('service')
        .leftJoinAndSelect('service.company', 'company')
        .leftJoinAndSelect('service.category', 'category')
        .leftJoinAndSelect('service.prestataires', 'serviceLink') // Relation avec prestataires
        .leftJoinAndSelect('serviceLink.prestataire', 'prestataire') // Les prestataires liés
        .where('company.id = :companyId', { companyId })
        .andWhere('service.status = :status', { status: ProductStatus.PUBLISHED })
        .orderBy('service.createdAt', 'DESC')
        .getMany();

      console.log('Services publiés trouvés:', services.length);

      // 🔹 Vérifier le contenu
      if (services.length > 0) {
        services.forEach((service, index) => {
          console.log(
            `Service ${index + 1}:`,
            service.name,
            `(Prestataires: ${service.prestataires?.length || 0})`,
          );
        });
      }

      return {
        message: 'Services publiés de la société récupérés avec succès',
        serviceCount: services.length,
        data: services,
      };
    } catch (error) {
      console.error('💥 Erreur:', error);
      throw error;
    }
  }
}
