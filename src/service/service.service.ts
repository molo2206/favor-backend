import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';

import { Service } from './entities/service.entity';
import { CategoryEntity } from 'src/category/entities/category.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { CloudinaryService } from 'src/users/utility/helpers/cloudinary.service';

import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { ProductStatus } from 'src/products/enum/product.status.enum';
import { UpdateServiceStatusDto } from './enum/updateServiceStatusDto.enum';

@Injectable()
export class ServiceService {
  constructor(
    @InjectRepository(Service)
    private readonly serviceRepo: Repository<Service>,

    @InjectRepository(CategoryEntity)
    private readonly categoryRepo: Repository<CategoryEntity>,

    private readonly cloudinary: CloudinaryService,
  ) {}

  async create(
    createServiceDto: CreateServiceDto,
    files: Express.Multer.File[],
    user: UserEntity,
  ): Promise<{ message: string; data: Service }> {
    const { categoryId, ...data } = createServiceDto;

    if (!user) {
      throw new BadRequestException('Utilisateur non authentifié');
    }

    if (!files || files.length < 1 || files.length > 4) {
      throw new BadRequestException('Vous devez fournir entre 1 et 4 images pour le service');
    }

    let category: CategoryEntity | null = null;
    if (categoryId) {
      category = await this.categoryRepo.findOne({ where: { id: categoryId } });
      if (!category) throw new NotFoundException('Catégorie non trouvée');
    }

    const uploadedUrls = await Promise.all(
      files.map((file) => this.cloudinary.handleUploadImage(file, 'service')),
    );

    if (!category) {
      throw new Error('Category must be defined');
    }

    const service = this.serviceRepo.create({
      ...data,
      category,
      imageUrls: uploadedUrls,
      companyId: user.activeCompanyId,
    });

    await this.serviceRepo.save(service);

    const serviceWithCompany = await this.serviceRepo.findOne({
      where: { id: service.id },
      relations: ['company', 'category', 'reservations'],
    });

    if (!serviceWithCompany) {
      throw new NotFoundException('Service non trouvé après création');
    }

    return {
      message: 'Service créé avec succès',
      data: serviceWithCompany,
    };
  }

  async findOne(id: string): Promise<{ message: string; data: Service }> {
    const service = await this.serviceRepo.findOne({
      where: { id },
      relations: ['company', 'category', 'reservations'],
    });

    if (!service) {
      throw new NotFoundException(`Service introuvable avec l'ID: ${id}`);
    }

    return {
      message: `Service trouvé avec l'ID: ${id}`,
      data: service,
    };
  }

  async findAll(): Promise<{ message: string; data: Service[] }> {
    const services = await this.serviceRepo.find({
      relations: ['company', 'category', 'reservations'],
    });

    return {
      message: 'Liste des services récupérée avec succès',
      data: services,
    };
  }

  async update(
    id: string,
    updateServiceDto: UpdateServiceDto,
    files?: Express.Multer.File[],
  ): Promise<{ message: string; data: Service }> {
    const service = await this.serviceRepo.findOne({
      where: { id },
      relations: ['category'],
    });

    if (!service) {
      throw new NotFoundException('Service non trouvé');
    }

    // Mise à jour des images si fichiers fournis
    if (files && files.length > 0) {
      if (files.length > 4) {
        throw new BadRequestException('Maximum 4 images autorisées');
      }

      const uploadedUrls = await Promise.all(
        files.map((file) => this.cloudinary.handleUploadImage(file, 'service')),
      );
      service.imageUrls = uploadedUrls;
    }

    // Mise à jour de la catégorie si besoin
    if (updateServiceDto.categoryId) {
      const category = await this.categoryRepo.findOne({
        where: { id: updateServiceDto.categoryId },
      });

      if (!category) {
        throw new NotFoundException('Catégorie non trouvée');
      }

      service.category = category;
    }

    Object.assign(service, updateServiceDto);

    await this.serviceRepo.save(service);

    return {
      message: 'Service mis à jour avec succès',
      data: service,
    };
  }

  async findPublishedServicesByType(
    type?: string,
  ): Promise<{ message: string; data: Service[] }> {
    const whereClause: any = { published: true };

    if (type) {
      whereClause.type = type;
    }

    const services = await this.serviceRepo.find({
      where: whereClause,
      relations: ['company', 'category', 'reservations'], // si tu veux charger les relations
    });

    return {
      message: 'Services publiés récupérés avec succès',
      data: services,
    };
  }

  async findPublishedServicesByFilters(
    type?: string,
    companyId?: string,
    shopType?: string,
    page = 1,
    limit = 10,
  ): Promise<{ message: string; data: Service[]; total: number; page: number; limit: number }> {
    // Construire les conditions WHERE dynamiquement
    const whereClause: any = { published: true };

    if (type) {
      whereClause.type = type;
    }

    if (companyId) {
      whereClause.companyId = companyId;
    }

    if (shopType) {
      whereClause.shopType = shopType;
    }

    // Pagination: calculer offset
    const skip = (page - 1) * limit;

    // Récupérer total avant pagination
    const total = await this.serviceRepo.count({ where: whereClause });

    // Récupérer les services paginés
    const services = await this.serviceRepo.find({
      where: whereClause,
      skip,
      take: limit,
      relations: ['company', 'category', 'reservations'], // adapter selon tes relations
    });

    return {
      message: `Services publiés récupérés avec succès${type ? ` pour le type : ${type}` : ''}.`,
      data: services,
      total,
      page,
      limit,
    };
  }

  async findByCategoryId(categoryId?: string): Promise<{ message: string; data: Service[] }> {
    const queryBuilder = this.serviceRepo
      .createQueryBuilder('service')
      .leftJoinAndSelect('service.company', 'company')
      .leftJoinAndSelect('service.category', 'category')
      .leftJoinAndSelect('service.reservations', 'reservations');

    if (categoryId) {
      queryBuilder.where('service.categoryId = :categoryId', { categoryId });
    }

    const services = await queryBuilder.getMany();

    return {
      message: `Services récupérés avec succès${categoryId ? ` pour la catégorie : ${categoryId}` : ''}.`,
      data: services,
    };
  }

  async findByActiveCompanyForUser(user: UserEntity): Promise<Service[]> {
    if (!user.activeCompanyId) {
      return [];
    }

    return this.serviceRepo.find({
      where: { companyId: user.activeCompanyId },
      relations: ['company', 'category', 'reservations'],
    });
  }

  async findByCategoryIdWithPagination(
    categoryId?: string,
    page = 1,
    limit = 10,
  ): Promise<{ message: string; data: Service[] }> {
    const queryBuilder = this.serviceRepo
      .createQueryBuilder('service')
      .leftJoinAndSelect('service.company', 'company')
      .leftJoinAndSelect('service.category', 'category')
      .leftJoinAndSelect('service.reservations', 'reservations')
      .where('service.status = :status', { status: ProductStatus.PUBLISHED });

    if (categoryId) {
      queryBuilder.andWhere('service.categoryId = :categoryId', { categoryId });
    }

    queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .orderBy('service.createdAt', 'DESC');

    const services = await queryBuilder.getMany();

    return {
      message: `Services publiés récupérés avec succès${categoryId ? ` pour la catégorie : ${categoryId}` : ''}.`,
      data: services,
    };
  }

  async findPublishedServicesByCategory(
    categoryId?: string,
    shopType?: string,
    page = 1,
    limit = 10,
  ): Promise<{ message: string; data: Service[]; total: number; page: number; limit: number }> {
    const whereClause: any = { published: true };

    if (categoryId) {
      whereClause.category = { id: categoryId };
    }

    if (shopType) {
      whereClause.shopType = shopType;
    }

    const skip = (page - 1) * limit;

    const total = await this.serviceRepo.count({ where: whereClause });

    const services = await this.serviceRepo.find({
      where: whereClause,
      skip,
      take: limit,
      relations: ['company', 'category', 'reservations'],
    });

    return {
      message: `Services publiés récupérés avec succès${categoryId ? ` pour la catégorie : ${categoryId}` : ''}.`,
      data: services,
      total,
      page,
      limit,
    };
  }

  async groupByType_First_Service(): Promise<Record<string, Service>> {
    const services = await this.serviceRepo.find({
      relations: ['company', 'category', 'reservations'],
      order: { createdAt: 'ASC' }, // s'assurer que le premier est le plus ancien
    });

    const grouped: Record<string, Service> = {};

    for (const service of services) {
      // On suppose que le service a un champ `type` (ou adapte selon ton modèle)
      if (service['type'] && !grouped[service['type']]) {
        grouped[service['type']] = service;
      }
    }

    return grouped;
  }
  async findByType(type?: string): Promise<{ message: string; data: Service[] }> {
    const queryBuilder = this.serviceRepo
      .createQueryBuilder('service')
      .leftJoinAndSelect('service.company', 'company')
      .leftJoinAndSelect('service.category', 'category')
      .leftJoinAndSelect('service.reservations', 'reservations');

    if (type) {
      // Si tu as un champ "type" dans Service
      queryBuilder.where('service.type = :type', { type });
    }

    const services = await queryBuilder.getMany();

    return {
      message: `Services récupérés avec succès${type ? ` pour le type : ${type}` : ''}.`,
      data: services,
    };
  }

  async updateStatus(
    id: string,
    dto: UpdateServiceStatusDto,
    user: UserEntity,
  ): Promise<{ message: string; data: Service }> {
    const service = await this.serviceRepo.findOne({ where: { id } });

    if (!service) {
      throw new NotFoundException('Service non trouvé');
    }

    if (!user) {
      throw new ForbiddenException("Vous n'êtes pas connecté");
    }

    // Mise à jour partielle du status, sans risquer d'écraser d'autres champs
    await this.serviceRepo.update(id, { status: dto.status });

    // Recharge complet avec relations
    const updated = await this.serviceRepo.findOne({
      where: { id },
      relations: ['company', 'category', 'reservations'],
    });

    if (!updated) {
      throw new NotFoundException('Service mis à jour introuvable');
    }

    return {
      message: 'Statut du service mis à jour avec succès',
      data: updated,
    };
  }

  async searchServices(search: string): Promise<{ message: string; data: Service[] }> {
    const qb = this.serviceRepo
      .createQueryBuilder('service')
      .leftJoinAndSelect('service.company', 'company')
      .leftJoinAndSelect('service.category', 'category')
      .where('service.status = :status', { status: ProductStatus.PUBLISHED });

    if (search) {
      qb.andWhere(
        new Brackets((qb) => {
          qb.where('service.full_name LIKE :search', { search: `%${search}%` })
            .orWhere('service.fonction LIKE :search', { search: `%${search}%` })
            .orWhere('category.name LIKE :search', { search: `%${search}%` })
            .orWhere('company.companyName LIKE :search', { search: `%${search}%` });
        }),
      );
    }

    const results = await qb.getMany();

    if (results.length === 0) {
      throw new NotFoundException(`Aucun service correspondant à la recherche : "${search}"`);
    }

    return {
      message: `Services correspondant à la recherche : "${search}"`,
      data: results,
    };
  }

  async remove(id: string): Promise<{ message: string }> {
    const service = await this.serviceRepo.findOne({ where: { id } });

    if (!service) {
      throw new NotFoundException('Service non trouvé');
    }

    await this.serviceRepo.remove(service);

    return {
      message: 'Service supprimé avec succès',
    };
  }
}
