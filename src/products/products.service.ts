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

    @InjectRepository(MeasureEntity)
    private readonly measureRepo: Repository<MeasureEntity>,
  ) {}

  async create(
    createProductDto: CreateProductDto,
    files: Express.Multer.File[],
    user: UserEntity,
  ): Promise<{ message: string; data: Product }> {
    const { categoryId, status, measureId, ...data } = createProductDto;

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

    const product = this.productRepo.create({
      ...data,
      company,
      category,
      measure,
      image: mainImage,
      type: company.typeCompany,
      status: productStatus,
      companyActivity: company?.companyActivity,
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
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('category.parent', 'categoryParent')
      .leftJoinAndSelect('category.children', 'categoryChildren')
      .leftJoinAndSelect('product.images', 'images')
      .leftJoinAndSelect('product.measure', 'measure');

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
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('category.parent', 'categoryParent')
      .leftJoinAndSelect('category.children', 'categoryChildren')
      .leftJoinAndSelect('product.images', 'images')
      .leftJoinAndSelect('product.measure', 'measure')
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
      .where('product.status = :status', { status: ProductStatus.PUBLISHED });

    if (type) {
      queryBuilder.andWhere('product.type = :type', { type });
    }

    if (companyId) {
      queryBuilder.andWhere('product.companyId = :companyId', { companyId });
    }

    if (shopType?.trim()) {
      if (shopType === CompanyActivity.WHOLESALER) {
        queryBuilder.andWhere('product.companyActivity IN (:...activities)', {
          activities: [CompanyActivity.WHOLESALER, CompanyActivity.WHOLESALER_RETAILER],
        });
      } else {
        queryBuilder.andWhere('product.companyActivity = :shopType', { shopType });
      }
    }

    if (fuelType) {
      queryBuilder.andWhere('product.fuelType = :fuelType', { fuelType });
    }

    if (transmission) {
      queryBuilder.andWhere('product.transmission = :transmission', { transmission });
    }

    // Filtrage selon typecar

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
    type?: string,
    minDailyRate?: number | string,
    maxDailyRate?: number | string,
    minSalePrice?: number | string,
    maxSalePrice?: number | string,
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
    const toNumber = (val: any) =>
      val !== undefined && val !== null && val !== '' ? Number(val) : undefined;

    minDailyRate = toNumber(minDailyRate);
    maxDailyRate = toNumber(maxDailyRate);
    minSalePrice = toNumber(minSalePrice);
    maxSalePrice = toNumber(maxSalePrice);

    const queryBuilder = this.productRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('category.parent', 'categoryParent')
      .leftJoinAndSelect('category.children', 'categoryChildren')
      .leftJoinAndSelect('product.images', 'images')
      .leftJoinAndSelect('product.measure', 'measure')
      .where('product.status = :status', { status: ProductStatus.PUBLISHED });

    // Filtre catégorie (inclut parent/enfants)
    if (categoryId) {
      queryBuilder.andWhere(
        '(category.id = :categoryId OR categoryParent.id = :categoryId OR categoryChildren.id = :categoryId)',
        { categoryId },
      );
    }

    // Filtre type produit
    if (type) {
      queryBuilder.andWhere('product.type = :type', { type });
    }

    // Filtre shopType
    if (shopType?.trim()) {
      if (shopType === CompanyActivity.WHOLESALER) {
        queryBuilder.andWhere('product.companyActivity IN (:...activities)', {
          activities: [CompanyActivity.WHOLESALER, CompanyActivity.WHOLESALER_RETAILER],
        });
      } else {
        queryBuilder.andWhere('product.companyActivity = :shopType', { shopType });
      }
    }

    if (fuelType) {
      queryBuilder.andWhere('product.fuelType = :fuelType', { fuelType });
    }

    if (transmission) {
      queryBuilder.andWhere('product.transmission = :transmission', { transmission });
    }

    if (year) {
      queryBuilder.andWhere('product.year = :year', { year });
    }

    // Logique pour typecar et filtres associés
    if (typecar) {
      if (typecar === Type_rental_both_sale_car.SALE) {
        // Filtre salePrice
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
        // Filtre dailyRate
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
        // SalePrice
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
        // DailyRate
        if (minDailyRate !== undefined) {
          queryBuilder.andWhere('product.dailyRate >= :minDailyRate', { minDailyRate });
        }
        if (maxDailyRate !== undefined) {
          queryBuilder.andWhere('product.dailyRate <= :maxDailyRate', { maxDailyRate });
        }
        queryBuilder.andWhere('product.typecar = :typecar', {
          typecar: Type_rental_both_sale_car.BOTH,
        });
      }
    } else {
      // Pas de typecar fourni
      if (
        minDailyRate !== undefined &&
        maxDailyRate !== undefined &&
        minSalePrice !== undefined &&
        maxSalePrice !== undefined
      ) {
        // On filtre directement sans condition sur typecar (tous produits)
        if (minDailyRate <= maxDailyRate) {
          queryBuilder.andWhere('product.dailyRate BETWEEN :minDailyRate AND :maxDailyRate', {
            minDailyRate,
            maxDailyRate,
          });
        }
        if (minSalePrice <= maxSalePrice) {
          queryBuilder.andWhere('product.salePrice BETWEEN :minSalePrice AND :maxSalePrice', {
            minSalePrice,
            maxSalePrice,
          });
        }
      } else {
        // Sinon, on conserve la logique précédente (filtrage partiel selon typecar)
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
    }

    // Tri par date de création par défaut
    queryBuilder.orderBy('product.createdAt', 'DESC');

    // Pagination
    if (limit > 0) {
      queryBuilder.skip((page - 1) * limit).take(limit);
    }

    const [products, total] = await queryBuilder.getManyAndCount();

    return {
      message: `Produits PUBLIÉS récupérés avec succès.`,
      data: {
        data: products,
        total,
        page,
        limit,
      },
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async findByActiveCompanyForUser(user: UserEntity): Promise<any> {
    if (!user.activeCompanyId) {
      throw new BadRequestException('Aucune entreprise active trouvée pour cet utilisateur');
    }

    const company = await this.companyRepo.findOne({
      where: { id: user.activeCompanyId },
    });

    const products = await this.productRepo.find({
      where: { company: { id: user.activeCompanyId } },
      relations: ['category', 'category.parent', 'category.children', 'images', 'measure'],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
    const { products: _, ...companyData } = company as any;

    return {
      ...companyData,
      products,
    };
  }
  async groupByType(): Promise<Record<string, Product[]>> {
    const products = await this.productRepo.find({
      relations: ['category', 'category.parent', 'category.children', 'images', 'measure'],
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
      relations: ['category.parent', 'category.children', 'images'],
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
      relations: ['company', 'category', 'images'],
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
    const { categoryId, status, measureId, ...data } = dto;

    const product = await this.productRepo.findOne({
      where: { id },
      relations: ['category', 'category.parent', 'category.children', 'images', 'measure'],
    });
    if (!product) throw new NotFoundException('Produit non trouvé');

    if (status) {
      product.status = status;
    }

    Object.assign(product, data);

    const company = await this.companyRepo.findOne({
      where: { id: user.activeCompanyId },
    });
    if (!company) throw new NotFoundException('Entreprise active non trouvée');
    product.company = company;
    product.type = company.typeCompany;

    if (categoryId) {
      const category = await this.categoryRepo.findOne({ where: { id: categoryId } });
      if (!category) throw new NotFoundException('Catégorie non trouvée');
      product.category = category;
    } else {
      product.category = undefined;
    }

    if (measureId) {
      const measure = await this.measureRepo.findOne({ where: { id: measureId } });
      if (!measure) throw new NotFoundException('Mesure non trouvée');
      product.measure = measure;
    } else {
      product.measure = undefined;
    }

    const updatedProduct = await this.productRepo.save(product);

    return {
      message: 'Produit mis à jour avec succès',
      data: updatedProduct,
    };
  }

  async searchProducts(search: string): Promise<{ message: string; data: Product[] }> {
    const qb = this.productRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.company', 'company')
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

  // Supprimer un produit
  // async remove(id: string): Promise<void> {
  //   const product = await this.findOne(id);
  //   await this.productRepo.remove(product);
  // }
}
