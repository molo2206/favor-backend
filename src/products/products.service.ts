import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { CategoryEntity } from 'src/category/entities/category.entity';
import { CloudinaryService } from 'src/users/utility/helpers/cloudinary.service';
import { ImageProductEntity } from './entities/imageProduct.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { ProductStatus } from 'src/products/enum/product.status.enum';
import { MeasureEntity } from 'src/measure/entities/measure.entity';
import { UpdateProductStatusDto } from './dto/update-product-status.dto';
import { CompanyActivity } from 'src/company/enum/activity.company.enum';
import { FuelType } from './enum/fuelType_enum';
import { Transmission } from './enum/transmission.enum';
import { Type_rental_both_sale_car } from './enum/type_rental_both_sale_car';
import { CompanyStatus } from 'src/company/enum/company-status.enum';
import { UserWithCompanyStatus } from 'src/users/interfaces/user-with-company-status.interface';
import { OrderItemEntity } from 'src/order-item/entities/order-item.entity';
import { In } from 'typeorm';
import { CompanyType } from 'src/company/enum/type.company.enum';
import { ProductSpecificationValueService } from 'src/specification/product-specification.service';
import { CreateProductSpecificationValueDto } from 'src/specification/dto/create-product-specification-value.dto';

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Product)
    private productRepo: Repository<Product>,

    @InjectRepository(CompanyEntity)
    private companyRepo: Repository<CompanyEntity>,

    @InjectRepository(CategoryEntity)
    private categoryRepo: Repository<CategoryEntity>,

    @InjectRepository(ImageProductEntity)
    private imageRepository: Repository<ImageProductEntity>,

    private readonly cloudinary: CloudinaryService,

    private readonly productSpecificationValueService: ProductSpecificationValueService,

    @InjectRepository(MeasureEntity)
    private readonly measureRepo: Repository<MeasureEntity>,

    @InjectRepository(OrderItemEntity)
    private readonly orderItemRepo: Repository<OrderItemEntity>,
  ) {}

  async create(
    createProductDto: CreateProductDto,
    files: Express.Multer.File[],
    user: UserWithCompanyStatus,
  ): Promise<{ message: string; data: Product }> {
    const { categoryId, status, measureId, min_quantity, specifications, ...data } =
      createProductDto;
    // if (user.companyStatus !== CompanyStatus.VALIDATED) {
    //   throw new ForbiddenException(
    //     'Votre société n’est pas encore validée. Impossible de créer un produit.',
    //   );
    // }

    if (!files || files.length < 2 || files.length > 4) {
      throw new BadRequestException('Vous devez fournir entre 2 et 4 images');
    }

    if (!user.activeCompanyId) {
      throw new BadRequestException('Aucune entreprise active trouvée pour cet utilisateur');
    }

    const company = await this.companyRepo.findOne({
      where: { id: user.activeCompanyId },
    });

    if (!company) {
      throw new NotFoundException('Entreprise active introuvable');
    }

    let category: CategoryEntity | null | undefined = undefined;
    if (categoryId) {
      category = await this.categoryRepo.findOne({ where: { id: categoryId } });
      if (!category) throw new NotFoundException('Catégorie non trouvée');
    }

    let measure: MeasureEntity | null | undefined = undefined;
    if (measureId) {
      measure = await this.measureRepo.findOne({ where: { id: measureId } });
      if (!measure) throw new NotFoundException('Mesure non trouvée');
    }

    const mainImage = await this.cloudinary.handleUploadImage(files[0], 'product');

    const productStatus = status || ProductStatus.PENDING;

    if (
      (company.companyActivity === CompanyActivity.WHOLESALER ||
        company.companyActivity === CompanyActivity.WHOLESALER_RETAILER) &&
      (min_quantity === undefined || min_quantity === null)
    ) {
      throw new BadRequestException(
        'Le champ "min_quantity" est obligatoire pour les entreprises de type grossiste ou mixte.',
      );
    }

    const product = this.productRepo.create({
      ...data,
      min_quantity: min_quantity ?? 0, // si ce n’est pas grossiste, on met 0
      company,
      category,
      measure,
      image: mainImage,
      type: company.typeCompany,
      status: productStatus,
      companyActivity: company.companyActivity,
    });

    await this.productRepo.save(product);

    const secondaryImages: ImageProductEntity[] = [];
    for (const file of files) {
      const uploaded = await this.cloudinary.handleUploadImage(file, 'product');
      const imageEntity = new ImageProductEntity();
      imageEntity.url = uploaded;
      imageEntity.product = product;
      secondaryImages.push(imageEntity);
    }

    await this.imageRepository.save(secondaryImages);
    product.images = secondaryImages;

    if (specifications && Array.isArray(specifications)) {
      for (const spec of specifications) {
        // Crée un DTO conforme à CreateProductSpecificationValueDto
        const specValueDto: CreateProductSpecificationValueDto = {
          productId: product.id, // ← on utilise productId et non product
          specificationId: spec.specificationId,
          value: spec.value ?? undefined, // undefined si non fourni
        };

        await this.productSpecificationValueService.create(specValueDto);
      }
    }

    return {
      message: 'Produit créé avec succès',
      data: product,
    };
  }

  async findOne(id: string): Promise<{ message: string; data: Product }> {
    const product = await this.productRepo.findOne({
      where: { id },
      relations: [
        'company',
        'category',
        'category.parent',
        'category.children',
        'images',
        'measure',
        'company.tauxCompanies',
        'company.country',
        'company.city',
        'specificationValues',
        'specificationValues.specification',
      ],
    });
    if (!product) {
      throw new NotFoundException(`Produit introuvable avec l'ID: ${id}`);
    }

    return {
      message: `Produit trouvé avec l'ID: ${id}`,
      data: product,
    };
  }

  async findByType(type?: string): Promise<{ message: string; data: Product[] }> {
    const queryBuilder = this.productRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.company', 'company')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('company.city', 'city')
      .leftJoinAndSelect('company.tauxCompanies', 'tauxCompanies')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('category.parent', 'categoryParent')
      .leftJoinAndSelect('category.children', 'categoryChildren')
      .leftJoinAndSelect('product.images', 'images')
      .leftJoinAndSelect('product.measure', 'measure')
      .leftJoinAndSelect('product.specificationValues', 'specificationValues')
      .leftJoinAndSelect('specificationValues.specification', 'specification');

    if (type) {
      queryBuilder.where('product.type = :type', { type });
    }

    const products = await queryBuilder.getMany();

    return {
      message: `Produits récupérés avec succès${type ? ` pour le type : ${type}` : ''}.`,
      data: products,
    };
  }

  async findProductPublishedByType(
    type?: string,
  ): Promise<{ message: string; data: Product[] }> {
    const queryBuilder = this.productRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.company', 'company')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('company.city', 'city')
      .leftJoinAndSelect('company.tauxCompanies', 'tauxCompanies')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('category.parent', 'categoryParent')
      .leftJoinAndSelect('category.children', 'categoryChildren')
      .leftJoinAndSelect('product.images', 'images')
      .leftJoinAndSelect('product.measure', 'measure')
      .leftJoinAndSelect('product.specificationValues', 'specificationValues')
      .leftJoinAndSelect('specificationValues.specification', 'specification')
      .where('product.status = :status', { status: ProductStatus.PUBLISHED });

    if (type) {
      queryBuilder.andWhere('product.type = :type', { type });
    }

    const products = await queryBuilder.getMany();

    return {
      message: `Produits PUBLIÉS récupérés avec succès${type ? ` pour le type : ${type}` : ''}.`,
      data: products,
    };
  }

  async findProductPublishedByTypeByCompany(
    type?: string,
    companyId?: string,
    shopType?: string,
    fuelType?: FuelType,
    transmission?: Transmission,
    typecar?: Type_rental_both_sale_car,
    minDailyRate?: number,
    maxDailyRate?: number,
    minSalePrice?: number,
    maxSalePrice?: number,
    page = 1,
    limit = 10,
  ): Promise<{
    message: string;
    data: {
      data: Product[];
      total: number;
      page: number;
      limit: number;
    };
  }> {
    const queryBuilder = this.productRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('category.parent', 'categoryParent')
      .leftJoinAndSelect('category.children', 'categoryChildren')
      .leftJoinAndSelect('product.images', 'images')
      .leftJoinAndSelect('product.measure', 'measure')
      .leftJoinAndSelect('product.company', 'company')
      .leftJoinAndSelect('product.specificationValues', 'specificationValues')
      .leftJoinAndSelect('specificationValues.specification', 'specification')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('company.city', 'city')
      .leftJoinAndSelect('company.tauxCompanies', 'tauxCompanies')
      .where('product.status = :status', { status: ProductStatus.PUBLISHED });

    if (type) {
      queryBuilder.andWhere('product.type = :type', { type });
    }

    if (companyId) {
      queryBuilder.andWhere('product.companyId = :companyId', { companyId });
    }

    if (shopType?.trim()) {
      if (shopType === CompanyActivity.WHOLESALER) {
        // Un grossiste peut aussi voir les produits des mixtes
        queryBuilder.andWhere('product.companyActivity IN (:...activities)', {
          activities: [CompanyActivity.WHOLESALER, CompanyActivity.WHOLESALER_RETAILER],
        });

        queryBuilder.andWhere(
          '(product.gros_price_original IS NOT NULL AND product.gros_price_original > 0)',
        );
      } else if (shopType === CompanyActivity.RETAILER) {
        // Un détaillant peut aussi voir les produits des mixtes
        queryBuilder.andWhere('product.companyActivity IN (:...activities)', {
          activities: [CompanyActivity.RETAILER, CompanyActivity.WHOLESALER_RETAILER],
        });

        queryBuilder.andWhere(
          '(product.detail_price_original IS NOT NULL AND product.detail_price_original > 0)',
        );
      } else if (shopType === CompanyActivity.WHOLESALER_RETAILER) {
        // Mixte → inclut les trois
        queryBuilder.andWhere('product.companyActivity IN (:...activities)', {
          activities: [
            CompanyActivity.WHOLESALER_RETAILER,
            CompanyActivity.WHOLESALER,
            CompanyActivity.RETAILER,
          ],
        });

        queryBuilder.andWhere(
          '((product.gros_price_original IS NOT NULL AND product.gros_price_original > 0) OR (product.detail_price_original IS NOT NULL AND product.detail_price_original > 0))',
        );
      }
    }

    if (fuelType) {
      queryBuilder.andWhere('product.fuelType = :fuelType', { fuelType });
    }

    if (transmission) {
      queryBuilder.andWhere('product.transmission = :transmission', { transmission });
    }

    if (typecar === Type_rental_both_sale_car.SALE) {
      if (minSalePrice !== undefined && maxSalePrice !== undefined) {
        if (minSalePrice === maxSalePrice) {
          queryBuilder.andWhere('product.salePrice = :exactPrice', {
            exactPrice: minSalePrice,
          });
        } else {
          queryBuilder.andWhere(
            '(product.salePrice BETWEEN :minSalePrice AND :maxSalePrice OR product.salePrice = :minSalePrice OR product.salePrice = :maxSalePrice)',
            { minSalePrice, maxSalePrice },
          );
        }
      } else {
        if (minSalePrice !== undefined) {
          queryBuilder.andWhere('product.salePrice >= :minSalePrice', { minSalePrice });
        }
        if (maxSalePrice !== undefined) {
          queryBuilder.andWhere('product.salePrice <= :maxSalePrice', { maxSalePrice });
        }
      }
      queryBuilder.andWhere('product.typecar = :typecar', {
        typecar: Type_rental_both_sale_car.SALE,
      });
    } else if (typecar === Type_rental_both_sale_car.RENTAL) {
      if (minDailyRate !== undefined) {
        queryBuilder.andWhere('product.dailyRate >= :minDailyRate', { minDailyRate });
      }
      if (maxDailyRate !== undefined) {
        queryBuilder.andWhere('product.dailyRate <= :maxDailyRate', { maxDailyRate });
      }
      queryBuilder.andWhere('product.typecar = :typecar', {
        typecar: Type_rental_both_sale_car.RENTAL,
      });
    } else if (typecar === Type_rental_both_sale_car.BOTH) {
      if (minSalePrice !== undefined && maxSalePrice !== undefined) {
        if (minSalePrice === maxSalePrice) {
          queryBuilder.andWhere('product.salePrice = :exactPrice', {
            exactPrice: minSalePrice,
          });
        } else {
          queryBuilder.andWhere(
            '(product.salePrice BETWEEN :minSalePrice AND :maxSalePrice OR product.salePrice = :minSalePrice OR product.salePrice = :maxSalePrice)',
            { minSalePrice, maxSalePrice },
          );
        }
      } else {
        if (minSalePrice !== undefined) {
          queryBuilder.andWhere('product.salePrice >= :minSalePrice', { minSalePrice });
        }
        if (maxSalePrice !== undefined) {
          queryBuilder.andWhere('product.salePrice <= :maxSalePrice', { maxSalePrice });
        }
      }
      if (minDailyRate !== undefined) {
        queryBuilder.andWhere('product.dailyRate >= :minDailyRate', { minDailyRate });
      }
      if (maxDailyRate !== undefined) {
        queryBuilder.andWhere('product.dailyRate <= :maxDailyRate', { maxDailyRate });
      }
      queryBuilder.andWhere('product.typecar = :typecar', {
        typecar: Type_rental_both_sale_car.BOTH,
      });
    } else {
      // Pas de filtre typecar — on prend tout
      if (minDailyRate !== undefined) {
        queryBuilder.andWhere(
          '(product.typecar IN (:...rentalTypes) AND product.dailyRate >= :minDailyRate)',
          {
            rentalTypes: [Type_rental_both_sale_car.RENTAL, Type_rental_both_sale_car.BOTH],
            minDailyRate,
          },
        );
      }
      if (maxDailyRate !== undefined) {
        queryBuilder.andWhere(
          '(product.typecar IN (:...rentalTypes) AND product.dailyRate <= :maxDailyRate)',
          {
            rentalTypes: [Type_rental_both_sale_car.RENTAL, Type_rental_both_sale_car.BOTH],
            maxDailyRate,
          },
        );
      }
      if (minSalePrice !== undefined) {
        queryBuilder.andWhere(
          '(product.typecar IN (:...saleTypes) AND product.salePrice >= :minSalePrice)',
          {
            saleTypes: [Type_rental_both_sale_car.SALE, Type_rental_both_sale_car.BOTH],
            minSalePrice,
          },
        );
      }
      if (maxSalePrice !== undefined) {
        queryBuilder.andWhere(
          '(product.typecar IN (:...saleTypes) AND product.salePrice <= :maxSalePrice)',
          {
            saleTypes: [Type_rental_both_sale_car.SALE, Type_rental_both_sale_car.BOTH],
            maxSalePrice,
          },
        );
      }
    }

    queryBuilder.orderBy('product.createdAt', 'DESC');
    queryBuilder.skip((page - 1) * limit).take(limit);

    const [products, total] = await queryBuilder.getManyAndCount();

    return {
      message: `Produits PUBLIÉS récupérés avec succès${type ? ` pour le type : ${type}` : ''}${
        companyId ? ` pour l'entreprise ${companyId}` : ''
      }.`,
      data: {
        data: products,
        total,
        page,
        limit,
      },
    };
  }

  async findProductPublishedByCategory(
    categoryId?: string,
    shopType?: string,
    fuelType?: FuelType,
    transmission?: Transmission,
    typecar?: Type_rental_both_sale_car,
    year?: string,
    yearStart?: number,
    yearEnd?: number,
    type?: string,
    companyId?: string,
    minDailyRate?: number,
    maxDailyRate?: number,
    minSalePrice?: number,
    maxSalePrice?: number,
    page = 1,
    limit = 10,
  ): Promise<{
    message: string;
    data: {
      data: Product[];
      total: number;
      page: number;
      limit: number;
    };
  }> {
    const queryBuilder = this.productRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.specificationValues', 'specificationValues')
      .leftJoinAndSelect('specificationValues.specification', 'specification')
      .leftJoinAndSelect('category.parent', 'categoryParent')
      .leftJoinAndSelect('category.children', 'categoryChildren')
      .leftJoinAndSelect('product.images', 'images')
      .leftJoinAndSelect('product.measure', 'measure')
      .leftJoinAndSelect('product.company', 'company')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('company.city', 'city')
      .leftJoinAndSelect('company.tauxCompanies', 'tauxCompanies')
      .where('product.status = :status', { status: ProductStatus.PUBLISHED });

    // 🔸 Filtre companyId
    if (companyId) {
      queryBuilder.andWhere('product.companyId = :companyId', { companyId });
    }

    // 🔸 Filtre catégorie
    if (categoryId) {
      queryBuilder.andWhere(
        '(category.id = :categoryId OR categoryParent.id = :categoryId OR categoryChildren.id = :categoryId)',
        { categoryId },
      );
    }

    // 🔸 Filtre type produit
    if (type) {
      queryBuilder.andWhere('product.type = :type', { type });
    }

    // 🔸 Filtre shopType avec logique WHOLESALER / RETAILER / WHOLESALER_RETAILER
    if (shopType?.trim()) {
      if (shopType === CompanyActivity.WHOLESALER) {
        queryBuilder.andWhere('product.companyActivity IN (:...activities)', {
          activities: [CompanyActivity.WHOLESALER, CompanyActivity.WHOLESALER_RETAILER],
        });

        queryBuilder.andWhere(
          '(product.gros_price_original IS NOT NULL AND product.gros_price_original > 0)',
        );
      } else if (shopType === CompanyActivity.RETAILER) {
        queryBuilder.andWhere('product.companyActivity IN (:...activities)', {
          activities: [CompanyActivity.RETAILER, CompanyActivity.WHOLESALER_RETAILER],
        });

        queryBuilder.andWhere(
          '(product.detail_price_original IS NOT NULL AND product.detail_price_original > 0)',
        );
      } else if (shopType === CompanyActivity.WHOLESALER_RETAILER) {
        queryBuilder.andWhere('product.companyActivity IN (:...activities)', {
          activities: [
            CompanyActivity.WHOLESALER_RETAILER,
            CompanyActivity.WHOLESALER,
            CompanyActivity.RETAILER,
          ],
        });

        queryBuilder.andWhere(
          '((product.gros_price_original IS NOT NULL AND product.gros_price_original > 0) OR (product.detail_price_original IS NOT NULL AND product.detail_price_original > 0))',
        );
      }
    }

    // 🔸 Filtre fuelType
    if (fuelType) {
      queryBuilder.andWhere('product.fuelType = :fuelType', { fuelType });
    }

    // 🔸 Filtre transmission
    if (transmission) {
      queryBuilder.andWhere('product.transmission = :transmission', { transmission });
    }

    // 🔸 Filtre année
    if (year) {
      queryBuilder.andWhere('product.year = :year', { year });
    }

    if (yearStart !== undefined || yearEnd !== undefined) {
      if (yearStart !== undefined && yearEnd !== undefined) {
        queryBuilder.andWhere(
          'CAST(product.year AS UNSIGNED) BETWEEN :yearStart AND :yearEnd',
          { yearStart, yearEnd },
        );
      } else if (yearStart !== undefined) {
        queryBuilder.andWhere('CAST(product.year AS UNSIGNED) >= :yearStart', { yearStart });
      } else if (yearEnd !== undefined) {
        queryBuilder.andWhere('CAST(product.year AS UNSIGNED) <= :yearEnd', { yearEnd });
      }
    }

    // 🔸 Filtre prix & typecar
    if (typecar) {
      if (typecar === Type_rental_both_sale_car.SALE) {
        if (minSalePrice !== undefined)
          queryBuilder.andWhere('product.salePrice >= :minSalePrice', { minSalePrice });
        if (maxSalePrice !== undefined)
          queryBuilder.andWhere('product.salePrice <= :maxSalePrice', { maxSalePrice });
        queryBuilder.andWhere('product.typecar = :typecar', {
          typecar: Type_rental_both_sale_car.SALE,
        });
      } else if (typecar === Type_rental_both_sale_car.RENTAL) {
        if (minDailyRate !== undefined)
          queryBuilder.andWhere('product.dailyRate >= :minDailyRate', { minDailyRate });
        if (maxDailyRate !== undefined)
          queryBuilder.andWhere('product.dailyRate <= :maxDailyRate', { maxDailyRate });
        queryBuilder.andWhere('product.typecar = :typecar', {
          typecar: Type_rental_both_sale_car.RENTAL,
        });
      } else if (typecar === Type_rental_both_sale_car.BOTH) {
        if (minSalePrice !== undefined)
          queryBuilder.andWhere('product.salePrice >= :minSalePrice', { minSalePrice });
        if (maxSalePrice !== undefined)
          queryBuilder.andWhere('product.salePrice <= :maxSalePrice', { maxSalePrice });
        if (minDailyRate !== undefined)
          queryBuilder.andWhere('product.dailyRate >= :minDailyRate', { minDailyRate });
        if (maxDailyRate !== undefined)
          queryBuilder.andWhere('product.dailyRate <= :maxDailyRate', { maxDailyRate });
        queryBuilder.andWhere('product.typecar = :typecar', {
          typecar: Type_rental_both_sale_car.BOTH,
        });
      }
    }

    //  Tri par date
    queryBuilder.orderBy('product.createdAt', 'DESC');

    //  Pagination
    if (limit > 0) {
      queryBuilder.skip((page - 1) * limit).take(limit);
    }

    const [products, total] = await queryBuilder.getManyAndCount();

    return {
      message: 'Produits PUBLIÉS récupérés avec succès.',
      data: { data: products, total, page, limit },
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async findByActiveCompanyForUser(user: UserEntity, page = 1, limit = 10): Promise<any> {
    if (!user.activeCompanyId) {
      throw new BadRequestException('Aucune entreprise active trouvée pour cet utilisateur');
    }

    // Vérification de l'entreprise active
    const company = await this.companyRepo.findOne({
      where: { id: user.activeCompanyId },
    });

    if (!company) {
      throw new NotFoundException("L'entreprise active n'existe pas");
    }

    // Pagination
    const skip = (page - 1) * limit;

    const [products, total] = await this.productRepo.findAndCount({
      where: { company: { id: user.activeCompanyId } },
      relations: [
        'category',
        'category.parent',
        'category.children',
        'images',
        'measure',
        'company.tauxCompanies',
        'company.country',
        'company.city',
      ],
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return {
      message: 'Liste des produits récupérée avec succès.',
      data: {
        data: products,
        total,
        page,
        limit,
      },
    };
  }

  async groupByType(): Promise<Record<string, Product[]>> {
    const products = await this.productRepo.find({
      relations: [
        'category',
        'category.parent',
        'category.children',
        'images',
        'measure',
        'company',
        'company.tauxCompanies',
        'company.country',
        'company.city',
      ],
    });

    const grouped = products.reduce(
      (acc, product) => {
        const type = product.type;

        if (!acc[type]) {
          acc[type] = [];
        }

        acc[type].push(product);
        return acc;
      },
      {} as Record<string, Product[]>,
    );

    return grouped;
  }

  async findAllGroupedByCategory(categoryId?: string): Promise<{
    data: (Omit<CategoryEntity, 'products'> & { products: Product[] })[];
  }> {
    const whereCondition = categoryId ? { category: { id: categoryId } } : {};

    const products = await this.productRepo.find({
      where: whereCondition,
      relations: [
        'category.parent',
        'category.children',
        'images',
        'company',
        'company.tauxCompanies',
        'company.country',
        'company.city',
      ],
    });

    const grouped = new Map<
      string,
      Omit<CategoryEntity, 'products'> & { products: Product[] }
    >();

    for (const product of products) {
      const category =
        product.category || ({ name: 'Aucune catégorie', id: 'no-category' } as CategoryEntity);
      const categoryKey = product.category?.id || 'no-category';

      if (!grouped.has(categoryKey)) {
        // On exclut le champ "products" de la catégorie pour éviter une boucle
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { products: _, ...categoryWithoutProducts } = category as CategoryEntity;
        grouped.set(categoryKey, { ...categoryWithoutProducts, products: [] });
      }

      // Supprimer la redondance dans chaque produit
      const cleanProduct = { ...product };
      delete cleanProduct.category;

      grouped.get(categoryKey)!.products.push(cleanProduct);
    }

    const result = Array.from(grouped.values()).sort((a, b) => a.name.localeCompare(b.name));

    return { data: result };
  }

  async groupByType_First_Product(): Promise<Record<string, Product>> {
    const products = await this.productRepo.find({
      relations: [
        'company',
        'category',
        'images',
        'company.tauxCompanies',
        'company.country',
        'company.city',
      ],
      order: { createdAt: 'ASC' }, // pour s'assurer que le "premier" est bien le plus ancien
    });

    const grouped: Record<string, Product> = {};

    for (const product of products) {
      if (!grouped[product.type]) {
        grouped[product.type] = product; // ajouter seulement le premier pour chaque type
      }
    }

    return grouped;
  }

  async update(id: string, dto: CreateProductDto, user: UserEntity) {
    const { categoryId, status, measureId, specifications, ...data } = dto;

    const product = await this.productRepo.findOne({
      where: { id },
      relations: [
        'category',
        'category.parent',
        'category.children',
        'images',
        'measure',
        'company',
        'company.tauxCompanies',
        'company.country',
        'company.city',
      ],
    });
    if (!product) throw new NotFoundException('Produit non trouvé');

    if (status) product.status = status;

    Object.assign(product, data);

    // Lien avec la société active
    const company = await this.companyRepo.findOne({ where: { id: user.activeCompanyId } });
    if (!company) throw new NotFoundException('Entreprise active non trouvée');
    product.company = company;
    product.type = company.typeCompany;

    // Lien avec la catégorie
    if (categoryId) {
      const category = await this.categoryRepo.findOne({ where: { id: categoryId } });
      if (!category) throw new NotFoundException('Catégorie non trouvée');
      product.category = category;
    } else {
      product.category = undefined;
    }

    // Lien avec la mesure
    if (measureId) {
      const measure = await this.measureRepo.findOne({ where: { id: measureId } });
      if (!measure) throw new NotFoundException('Mesure non trouvée');
      product.measure = measure;
    } else {
      product.measure = undefined;
    }

    const updatedProduct = await this.productRepo.save(product);

    // ✅ Gestion des valeurs de spécifications
    if (specifications && Array.isArray(specifications)) {
      // 1. Supprimer toutes les anciennes valeurs pour ce produit
      await this.productSpecificationValueService.removeAllValuesFromProduct(updatedProduct.id);

      // 2. Ajouter ou mettre à jour les nouvelles
      for (const spec of specifications) {
        if (!spec.specificationId) {
          throw new BadRequestException(
            'Chaque spécification doit contenir un specificationId',
          );
        }
        await this.productSpecificationValueService.create({
          productId: updatedProduct.id,
          specificationId: spec.specificationId,
          value: spec.value,
        });
      }
    }

    return {
      message: 'Produit mis à jour avec succès',
      data: updatedProduct,
    };
  }

  async searchProducts(search: string): Promise<{ message: string; data: Product[] }> {
    const qb = this.productRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.company', 'company')
      .leftJoinAndSelect('company.tauxCompanies', 'tauxCompanies')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('company.city', 'city')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.images', 'images');

    if (search) {
      qb.where('product.name LIKE :search', { search: `%${search}%` })
        .orWhere('product.type LIKE :search', { search: `%${search}%` })
        .orWhere('category.name LIKE :search', { search: `%${search}%` })
        .orWhere('company.companyName LIKE :search', { search: `%${search}%` });
    }

    const results = await qb.getMany();

    if (results.length === 0) {
      throw new NotFoundException(`Aucun produit correspondant à la recherche : "${search}"`);
    }

    return {
      message: `Produits correspondant à la recherche : "${search}"`,
      data: results,
    };
  }

  async updateStatus(
    id: string,
    dto: UpdateProductStatusDto,
    user: UserEntity,
  ): Promise<{ message: string; data: Product }> {
    const product = await this.productRepo.findOne({
      where: { id },
      relations: ['company'],
    });

    if (!product) {
      throw new NotFoundException('Produit non trouvé');
    }

    if (!user) {
      throw new ForbiddenException("Vous n'êtes pas connecter");
    }

    product.status = dto.status;
    await this.productRepo.save(product);

    // Recharger le produit avec toutes ses relations
    const updated = await this.productRepo.findOne({
      where: { id },
      relations: [
        'company',
        'company.tauxCompanies',
        'company.country',
        'company.city',
        'category',
        'category.parent',
        'category.children',
        'images',
        'measure',
      ],
    });
    if (!updated) {
      throw new NotFoundException('Produit mis à jour introuvable');
    }
    return {
      message: 'Statut du produit mis à jour avec succès',
      data: updated,
    };
  }

  async getBestSellingProducts(
    page = 1,
    limit = 5,
    type: string = CompanyType.SHOP, // valeur par défaut
  ) {
    const offset = (page - 1) * limit;

    let query = this.orderItemRepo
      .createQueryBuilder('orderItem')
      .select('orderItem.productId', 'productId')
      .addSelect('SUM(orderItem.quantity)', 'totalSold')
      .leftJoin('orderItem.product', 'product')
      .where('product.type = :type', { type }); // toujours filtrer par type

    query = query
      .groupBy('orderItem.productId')
      .orderBy('totalSold', 'DESC')
      .offset(offset)
      .limit(limit);

    const result = await query.getRawMany();
    const productIds = result.map((r) => r.productId);

    if (productIds.length === 0) {
      return {
        message: `Aucun produit vendu pour le type : ${type}.`,
        data: {
          data: [],
          total: 0,
          page,
          limit,
        },
      };
    }

    const products = await this.productRepo.find({
      where: { id: In(productIds) },
      relations: [
        'company',
        'category',
        'measure',
        'images',
        'company.tauxCompanies',
        'company.country',
        'company.city',
      ],
    });

    const productsWithSales = products.map((p) => ({
      ...p,
      totalSold: Number(result.find((r) => r.productId === p.id)?.totalSold || 0),
    }));

    const totalCount = await this.productRepo.count({ where: { type } });

    return {
      message: `Produits PUBLIÉS récupérés avec succès pour le type : ${type}.`,
      data: {
        data: productsWithSales.sort((a, b) => b.totalSold - a.totalSold),
        total: totalCount,
        page,
        limit,
      },
    };
  }
}
