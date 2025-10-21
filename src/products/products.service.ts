import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
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
import { plainToInstance } from 'class-transformer';
import { Wishlist } from './entities/wishlists.entity';
import { CreateWishlistDto } from './dto/create-wishlist.dto';
import { Service } from 'src/service/entities/service.entity';
import { ProductAttribute } from 'src/Attribut/entities/product_attributes.entity';
import { AttributeValue } from 'src/Attribut/entities/attribute_values.entity';
import { Sku } from 'src/Attribut/entities/skus.entity';
import { CreateSkuDto } from 'src/Attribut/dto/create-sku.dto';
import { CreateProductAttributeDto } from 'src/Attribut/dto/create-product-attribute.dto';
import { Specification } from 'src/specification/entities/Specification.entity';

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

    @InjectRepository(Service)
    private readonly serviceRepo: Repository<Service>,

    private readonly cloudinary: CloudinaryService,

    private readonly productSpecificationValueService: ProductSpecificationValueService,

    @InjectRepository(MeasureEntity)
    private readonly measureRepo: Repository<MeasureEntity>,

    @InjectRepository(OrderItemEntity)
    private readonly orderItemRepo: Repository<OrderItemEntity>,

    @InjectRepository(Wishlist)
    private readonly wishlistRepo: Repository<Wishlist>,

    // 🔹 Injection pour ProductAttribute et AttributeValue
    @InjectRepository(ProductAttribute)
    private readonly productAttributeRepo: Repository<ProductAttribute>,

    @InjectRepository(AttributeValue)
    private readonly attributeValueRepo: Repository<AttributeValue>,

    @InjectRepository(Sku)
    private skuRepo: Repository<Sku>,

    @InjectRepository(Specification)
    private specRepo: Repository<Specification>,
  ) {}

  async create(
    createProductDto: CreateProductDto,
    files: Express.Multer.File[],
    user: UserWithCompanyStatus,
  ): Promise<{ message: string; data: Product }> {
    const {
      categoryId,
      status,
      measureId,
      min_quantity,
      specifications,
      attributes,
      skus,
      ...data
    } = createProductDto;

    // 🔹 Validation images
    if (!files || files.length < 2 || files.length > 4) {
      throw new BadRequestException('Vous devez fournir entre 2 et 4 images');
    }

    if (!user.activeCompanyId) {
      throw new BadRequestException('Aucune entreprise active trouvée pour cet utilisateur');
    }

    const company = await this.companyRepo.findOne({ where: { id: user.activeCompanyId } });
    if (!company) throw new NotFoundException('Entreprise active introuvable');

    // 🔹 Récupération catégorie
    let category: CategoryEntity | null | undefined;
    if (categoryId) {
      category = await this.categoryRepo.findOne({ where: { id: categoryId } });
      if (!category) throw new NotFoundException('Catégorie non trouvée');
    }

    // 🔹 Récupération mesure
    let measure: MeasureEntity | null | undefined;
    if (measureId) {
      measure = await this.measureRepo.findOne({ where: { id: measureId } });
      if (!measure) throw new NotFoundException('Mesure non trouvée');
    }

    // 🔹 Upload image principale
    const mainImage = await this.cloudinary.handleUploadImage(files[0], 'product');
    const productStatus = status || ProductStatus.PENDING;

    // 🔹 Vérification min_quantity pour grossiste
    if (
      (company.companyActivity === CompanyActivity.WHOLESALER ||
        company.companyActivity === CompanyActivity.WHOLESALER_RETAILER) &&
      (min_quantity === undefined || min_quantity === null)
    ) {
      throw new BadRequestException(
        'Le champ "min_quantity" est obligatoire pour les entreprises de type grossiste ou mixte.',
      );
    }

    // 🔹 Création du produit
    const product = this.productRepo.create({
      ...data,
      min_quantity: min_quantity ?? 0,
      company,
      category,
      measure,
      image: mainImage,
      type: company.typeCompany,
      status: productStatus,
      companyActivity: company.companyActivity,
    } as DeepPartial<Product>);
    await this.productRepo.save(product);

    // 🔹 Upload des images secondaires
    const secondaryImages: ImageProductEntity[] = [];
    for (const file of files) {
      const uploaded = await this.cloudinary.handleUploadImage(file, 'product');
      const imageEntity = this.imageRepository.create({ url: uploaded, product });
      secondaryImages.push(await this.imageRepository.save(imageEntity));
    }
    product.images = secondaryImages;

    // 🔹 Création des spécifications
    if (specifications && Array.isArray(specifications)) {
      for (const spec of specifications) {
        const specification = await this.specRepo.findOne({
          where: { id: spec.specificationId },
        });

        if (!specification) {
          // 🚨 La spécification n'existe pas, on renvoie une erreur
          throw new BadRequestException(
            `La spécification avec l'ID ${spec.specificationId} n'existe pas.`,
          );
        }

        const specValueDto: CreateProductSpecificationValueDto = {
          productId: product.id,
          specificationId: specification.id,
          value: spec.value ?? undefined,
        };
        await this.productSpecificationValueService.create(specValueDto);
      }
    }

    // 🔹 Création des attributs et valeurs produits
    if (attributes && Array.isArray(attributes)) {
      for (const attr of attributes as CreateProductAttributeDto[]) {
        // Préparer les données à insérer
        const productAttrData: Partial<ProductAttribute> = {
          productId: product.id,
          name: attr.name,
        };

        // Ajouter globalAttrId uniquement s'il existe
        if (attr.globalAttrId && attr.globalAttrId.trim() !== '') {
          productAttrData.globalAttrId = attr.globalAttrId;
        }

        // Créer et sauvegarder l'attribut
        const productAttr = this.productAttributeRepo.create(productAttrData);
        await this.productAttributeRepo.save(productAttr);

        // Créer et sauvegarder les valeurs associées
        if (attr.values && Array.isArray(attr.values)) {
          for (const val of attr.values) {
            if (val.value && val.value.trim() !== '') {
              const attributeValue = this.attributeValueRepo.create({
                attributeId: productAttr.id, // lier à l'attribut créé
                value: val.value,
              });
              await this.attributeValueRepo.save(attributeValue);
            }
          }
        }
      }
    }
    function generateUniqueSku(base: string): string {
      return `${base}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    }

    // 🔹 Création des SKUs avec génération automatique pour éviter les doublons
    if (skus && Array.isArray(skus)) {
      for (const skuDto of skus as CreateSkuDto[]) {
        const skuCode = skuDto.skuCode
          ? generateUniqueSku(skuDto.skuCode)
          : generateUniqueSku('SKU');
        const sku = this.skuRepo.create({
          productId: product.id,
          skuCode,
          price: skuDto.price,
          stock: skuDto.stock,
          attributesJson: skuDto.attributesJson ?? {},
          imageUrl: skuDto.imageUrl ?? undefined, // 🔹 Remplace null par undefined
        } as DeepPartial<Sku>);
        await this.skuRepo.save(sku);
      }
    }

    // 🔹 Sérialisation finale
    const serializedProduct = plainToInstance(Product, product, {
      excludeExtraneousValues: true,
    });

    return {
      message: 'Produit créé avec succès',
      data: serializedProduct,
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
        'specificationValues',
        'specificationValues.specification',
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
        'specificationValues',
        'specificationValues.specification',
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
        'specificationValues',
        'specificationValues.specification',
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
        'specificationValues',
        'specificationValues.specification',
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
    const { categoryId, status, measureId, specifications, skus, attributes, ...data } = dto;

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
        'specificationValues',
        'specificationValues.specification',
        'skus',
        'attributes', // ajouter si tu as une relation product.attributes
        'attributes.values', // pour récupérer les valeurs existantes
      ],
    });
    if (!product) throw new NotFoundException('Produit non trouvé');

    if (status) product.status = status;
    Object.assign(product, data);

    // 🔹 Lien avec la société active
    const company = await this.companyRepo.findOne({ where: { id: user.activeCompanyId } });
    if (!company) throw new NotFoundException('Entreprise active non trouvée');
    product.company = company;
    product.type = company.typeCompany;

    // 🔹 Lien avec la catégorie
    if (categoryId) {
      const category = await this.categoryRepo.findOne({ where: { id: categoryId } });
      if (!category) throw new NotFoundException('Catégorie non trouvée');
      product.category = category;
    } else {
      product.category = undefined;
    }

    // 🔹 Lien avec la mesure
    if (measureId) {
      const measure = await this.measureRepo.findOne({ where: { id: measureId } });
      if (!measure) throw new NotFoundException('Mesure non trouvée');
      product.measure = measure;
    } else {
      product.measure = undefined;
    }

    const updatedProduct = await this.productRepo.save(product);

    // 🔹 Gestion des valeurs de spécifications
    if (specifications && Array.isArray(specifications)) {
      for (const spec of specifications) {
        if (!spec.specificationId)
          throw new BadRequestException(
            'Chaque spécification doit contenir un specificationId',
          );

        // Vérifier que la spécification existe dans la base
        const specExists = await this.specRepo.findOne({
          where: { id: spec.specificationId },
        });
        if (!specExists) {
          throw new BadRequestException(
            `La spécification avec id ${spec.specificationId} n'existe pas`,
          );
        }

        await this.productSpecificationValueService.create({
          productId: updatedProduct.id,
          specificationId: spec.specificationId,
          value: spec.value,
        });
      }
    }

    // 🔹 Gestion des attributs
    if (attributes && Array.isArray(attributes)) {
      // Supprimer les anciens attributs et valeurs
      if (product.attributes && product.attributes.length > 0) {
        for (const attr of product.attributes) {
          if (attr.values && attr.values.length > 0) {
            await this.attributeValueRepo.remove(attr.values);
          }
        }
        await this.productAttributeRepo.remove(product.attributes);
      }

      // Créer les nouveaux attributs et valeurs
      for (const attr of attributes as CreateProductAttributeDto[]) {
        const productAttrData: Partial<ProductAttribute> = {
          productId: updatedProduct.id,
          name: attr.name,
          globalAttrId: attr.globalAttrId?.trim() || undefined,
        };
        const productAttr = this.productAttributeRepo.create(productAttrData);
        await this.productAttributeRepo.save(productAttr);

        if (attr.values && Array.isArray(attr.values)) {
          for (const val of attr.values) {
            const value = val.value?.trim();
            if (value) {
              const attributeValue = this.attributeValueRepo.create({
                attributeId: productAttr.id,
                value,
              } as DeepPartial<AttributeValue>);
              await this.attributeValueRepo.save(attributeValue);
            }
          }
        }
      }
    }

    // 🔹 Gestion des SKUs
    if (skus && Array.isArray(skus)) {
      // Supprimer les anciens SKUs
      if (updatedProduct.skus && updatedProduct.skus.length > 0) {
        await this.skuRepo.remove(updatedProduct.skus);
      }

      // Générer SKUs uniques
      const generateUniqueSku = (base: string) =>
        `${base}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      for (const skuDto of skus as CreateSkuDto[]) {
        const skuCode = skuDto.skuCode
          ? generateUniqueSku(skuDto.skuCode)
          : generateUniqueSku('SKU');

        const sku = this.skuRepo.create({
          productId: updatedProduct.id,
          skuCode,
          price: skuDto.price,
          stock: skuDto.stock,
          attributesJson: skuDto.attributesJson ?? {},
          imageUrl: skuDto.imageUrl ?? undefined,
        } as DeepPartial<Sku>);
        await this.skuRepo.save(sku);
      }
    }

    const serializedProduct = plainToInstance(Product, updatedProduct, {
      excludeExtraneousValues: true,
    });

    return {
      message: 'Produit mis à jour avec succès',
      data: serializedProduct,
    };
  }

  async searchProducts(search: string): Promise<{ message: string; data: Product[] }> {
    const qb = this.productRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.company', 'company')
      .leftJoinAndSelect('product.specificationValues', 'specificationValues')
      .leftJoinAndSelect('specificationValues.specification', 'specification')
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
        'specificationValues',
        'specificationValues.specification',
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
        'specificationValues',
        'specificationValues.specification',
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

  async addToWishlist(user: UserEntity, dto: CreateWishlistDto) {
    // 🔹 Vérification utilisateur
    if (!user || !user.id) {
      throw new BadRequestException('Utilisateur non trouvé ou non connecté');
    }

    // 🔹 Vérification productId
    if (!dto.productId) {
      throw new BadRequestException('productId est obligatoire');
    }

    // 🔹 Vérification existence du produit
    const product = await this.productRepo.findOne({ where: { id: dto.productId } });
    if (!product) throw new NotFoundException('Produit introuvable');

    // 🔹 Vérifier si déjà présent dans la wishlist (actif ou supprimé)
    const existing = await this.wishlistRepo.findOne({
      where: { user: { id: user.id }, product: { id: product.id } },
    });

    if (existing) {
      // Soft delete de l'ancien
      existing.deleted = true;
      existing.status = false;
      await this.wishlistRepo.save(existing);
    }

    // 🔹 Créer une nouvelle entrée wishlist propre
    const wishlistItem = this.wishlistRepo.create({
      user,
      product,
      deleted: false,
      status: true,
      shopType: dto.shopType,
    });

    const savedItem = await this.wishlistRepo.save(wishlistItem);

    // 🔹 Récupération complète de la wishlist mise à jour
    const updatedWishlist = await this.wishlistRepo.find({
      where: {
        user: { id: user.id },
        deleted: false,
      },
      relations: [
        'user',
        'product',

        // 🔹 Relations du produit
        'product.images',
        'product.category',
        'product.measure',
        'product.company',
        'product.company.tauxCompanies',
        'product.company.country',
        'product.company.city',

        // 🔹 Spécifications & Attributs
        'product.specificationValues',
        'product.specificationValues.specification',
        'product.attributes',
        'product.skus',

        // 🔹 Liens métiers
        'product.rentalContracts',
        'product.saleTransactions',
      ],
      order: { createdAt: 'DESC' },
    });

    return {
      message: existing
        ? 'Produit remplacé dans la wishlist avec succès'
        : 'Produit ajouté à la wishlist avec succès',
      data: {
        total: updatedWishlist.length,
        wishlist: updatedWishlist,
      },
    };
  }

  async getUserWishlist(user: UserEntity) {
    if (!user?.id) {
      throw new BadRequestException('Utilisateur non trouvé ou non connecté.');
    }

    const wishlistItems = await this.wishlistRepo.find({
      where: {
        user: { id: user.id },
        deleted: false,
        status: true,
      },
      relations: [
        // 🔹 Relations directes
        'user',
        'product',

        // 🔹 Relations du produit
        'product.images',
        'product.category',
        'product.measure',
        'product.company',
        'product.company.tauxCompanies',
        'product.company.country',
        'product.company.city',

        // 🔹 Spécifications & Attributs
        'product.specificationValues',
        'product.specificationValues.specification',
        'product.attributes',
        'product.skus',

        // 🔹 Liens métiers
        'product.rentalContracts',
        'product.saleTransactions',
      ],
      order: { createdAt: 'DESC' },
    });

    return {
      message: 'Wishlist récupérée avec succès',
      count: wishlistItems.length,
      data: wishlistItems.map((item) => ({
        id: item.id,
        createdAt: item.createdAt,
        shopType: item.shopType,
        product: {
          ...item.product,
        },
      })),
    };
  }

  async removeFromWishlist(user: UserEntity, productId: string) {
    const item = await this.wishlistRepo.findOne({
      where: {
        user: { id: user.id },
        product: { id: productId },
        deleted: false,
      },
    });

    if (!item) {
      throw new NotFoundException('Ce produit n’est pas dans la wishlist');
    }

    // 🔹 Soft delete
    item.deleted = true;
    item.status = false;
    await this.wishlistRepo.save(item);

    // 🔹 Récupération complète de la wishlist mise à jour
    const updatedWishlist = await this.wishlistRepo.find({
      where: {
        user: { id: user.id },
        deleted: false,
      },
      relations: [
        'user',
        'product',

        // 🔹 Relations du produit
        'product.images',
        'product.category',
        'product.measure',
        'product.company',
        'product.company.tauxCompanies',
        'product.company.country',
        'product.company.city',

        // 🔹 Spécifications & Attributs
        'product.specificationValues',
        'product.specificationValues.specification',
        'product.attributes',
        'product.skus',

        // 🔹 Liens métiers
        'product.rentalContracts',
        'product.saleTransactions',
      ],
      order: { createdAt: 'DESC' },
    });

    return {
      message: 'Produit retiré de la wishlist',
      data: {
        total: updatedWishlist.length,
        wishlist: updatedWishlist,
      },
    };
  }

  async search(keyword?: string, type?: CompanyType) {
    const searchKey = keyword ? `%${keyword}%` : '%';

    // 1. Recherche des companies
    const companyQuery = this.companyRepo
      .createQueryBuilder('company')
      .leftJoinAndSelect('company.userHasCompany', 'userHasCompany')
      .leftJoinAndSelect('company.products', 'products')
      .leftJoinAndSelect('company.branches', 'branches')
      .leftJoinAndSelect('company.measures', 'measures')
      .leftJoinAndSelect('company.services', 'services')
      .leftJoinAndSelect('company.rooms', 'rooms')
      .leftJoinAndSelect('company.tauxCompanies', 'tauxCompanies')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('company.city', 'city')
      .where('company.companyName LIKE :searchKey', { searchKey });

    if (type) {
      companyQuery.andWhere('company.typeCompany = :type', { type });
    }

    const companies = await companyQuery.getMany();

    //  2. Recherche des produits avec catégories et parents
    const productQuery = this.productRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.company', 'company')
      .leftJoinAndSelect('company.tauxCompanies', 'tauxCompanies')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('company.city', 'city')
      .leftJoinAndSelect('product.images', 'images')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('category.parent', 'parentCategory')
      .leftJoinAndSelect('product.measure', 'measure')
      .leftJoinAndSelect('product.specificationValues', 'specificationValues')
      .leftJoinAndSelect('specificationValues.specification', 'specification')
      .where(
        `
    (product.name LIKE :searchKey
    OR product.description LIKE :searchKey
    OR category.name LIKE :searchKey
    OR parentCategory.name LIKE :searchKey)
    AND product.status = :status
  `,
        { searchKey, status: 'PUBLISHED' },
      );
    if (type) {
      productQuery.andWhere('company.typeCompany = :type', { type });
    }

    const products = await productQuery.orderBy('product.createdAt', 'DESC').getMany();

    //  3. Recherche des services avec catégories et parents
    const serviceQuery = this.serviceRepo
      .createQueryBuilder('service')
      .leftJoinAndSelect('service.company', 'company')
      .leftJoinAndSelect('company.tauxCompanies', 'tauxCompanies')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('company.city', 'city')
      .leftJoinAndSelect('service.category', 'category')
      .leftJoinAndSelect('category.parent', 'parentCategory')
      .leftJoinAndSelect('service.measure', 'measure')
      .leftJoinAndSelect('service.prestataires', 'prestataires')
      .leftJoinAndSelect('prestataires.prestataire', 'prestataire')
      .where(
        `
      service.name LIKE :searchKey
      OR service.description LIKE :searchKey
      OR category.name LIKE :searchKey
      OR parentCategory.name LIKE :searchKey
    `,
        { searchKey },
      );

    if (type) {
      serviceQuery.andWhere('company.typeCompany = :type', { type });
    }

    const services = await serviceQuery.orderBy('service.createdAt', 'DESC').getMany();

    //  4. Préparer la structure finale
    const groupedResults: Record<string, any> = {
      [CompanyType.RESTAURANT]: [],
      [CompanyType.GROCERY]: [],
      [CompanyType.SHOP]: [],
      [CompanyType.SERVICE]: [],
      PRODUCT: [],
      SERVICE_LIST: [],
    };

    // 5. Grouper les entreprises par type
    for (const company of companies) {
      if (groupedResults[company.typeCompany]) {
        groupedResults[company.typeCompany].push(company);
      }
    }

    // 6. Ajouter les produits dans PRODUCT
    for (const prod of products) {
      if (prod.company?.typeCompany === CompanyType.SHOP) {
        groupedResults.PRODUCT.push(prod);
      }
    }

    // 7. Ajouter les services dans SERVICE_LIST
    for (const serv of services) {
      groupedResults.SERVICE_LIST.push(serv);
    }

    // 8. Retour final
    return {
      message:
        companies.length === 0 && products.length === 0 && services.length === 0
          ? 'Aucun résultat trouvé.'
          : 'Résultats de la recherche récupérés avec succès.',
      data: groupedResults,
    };
  }
}
