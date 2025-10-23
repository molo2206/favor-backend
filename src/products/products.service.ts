import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
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
import { In, DataSource } from 'typeorm';
import { CompanyType } from 'src/company/enum/type.company.enum';
import { ProductSpecificationValueService } from 'src/specification/product-specification.service';
import { CreateProductSpecificationValueDto } from 'src/specification/dto/create-product-specification-value.dto';
import { plainToInstance } from 'class-transformer';
import { Wishlist } from './entities/wishlists.entity';
import { CreateWishlistDto } from './dto/create-wishlist.dto';
import { Service } from 'src/service/entities/service.entity';
import { Specification } from 'src/specification/entities/Specification.entity';
import { ProductAttribute } from 'src/AttributGlobal/entities/product_attributes.entity';
import { Attribute } from 'src/AttributGlobal/entities/attributes.entity';
import { ProductSpecificationValue } from 'src/specification/entities/ProductSpecificationValue.entity';
import { ProductVariation } from 'src/AttributGlobal/entities/product_variations.entity';
import { VariationAttributeValue } from 'src/AttributGlobal/entities/variation_attribute_values.entity';

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

    @InjectRepository(Attribute)
    private readonly attributeRepo: Repository<Attribute>,

    @InjectRepository(ProductAttribute)
    private readonly productAttributeRepo: Repository<ProductAttribute>,

    private readonly dataSource: DataSource,

    // 🔹 Injection pour ProductAttribute et AttributeValue

    @InjectRepository(Specification)
    private specRepo: Repository<Specification>,
  ) {}

  private readonly logger = new Logger(ProductService.name);
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
      variations, // ✅ Ajouter les variations depuis le DTO
      ...data
    } = createProductDto;

    // 🔹 Validation images
    if (!files || files.length < 1 || files.length > 5) {
      throw new BadRequestException('Vous devez fournir entre 1 et 4 images');
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

    // 🔹 Utilisation d'une transaction pour garantir l'intégrité des données
    return await this.dataSource.transaction(async (manager) => {
      // 🔹 Création du produit
      const product = manager.create(Product, {
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

      const savedProduct = await manager.save(product);

      // 🔹 Upload des images secondaires
      const secondaryImages: ImageProductEntity[] = [];
      for (const file of files) {
        const uploaded = await this.cloudinary.handleUploadImage(file, 'product');
        const imageEntity = manager.create(ImageProductEntity, {
          url: uploaded,
          product: savedProduct,
        });
        const savedImage = await manager.save(imageEntity);
        secondaryImages.push(savedImage);
      }
      savedProduct.images = secondaryImages;

      // 🔹 Création des spécifications
      if (specifications && Array.isArray(specifications)) {
        for (const spec of specifications) {
          const specification = await manager.findOne(Specification, {
            where: { id: spec.specificationId },
          });

          if (!specification) {
            throw new BadRequestException(
              `La spécification avec l'ID ${spec.specificationId} n'existe pas.`,
            );
          }

          const specValue = manager.create(ProductSpecificationValue, {
            product: savedProduct,
            specification,
            value: spec.value ?? undefined,
          });
          await manager.save(specValue);
        }
      }

      // 🔹 Création des attributs
      if (attributes && Array.isArray(attributes)) {
        for (const attributeId of attributes) {
          const attribute = await manager.findOne(Attribute, {
            where: { id: attributeId },
          });
          if (!attribute) {
            throw new BadRequestException(`L'attribut avec l'ID ${attributeId} n'existe pas.`);
          }

          const productAttribute = manager.create(ProductAttribute, {
            product: savedProduct,
            attribute,
          });
          await manager.save(productAttribute);
        }
      }

      // 🔹 Création des variations de produit
      if (variations && Array.isArray(variations)) {
        for (const variationDto of variations) {
          const {
            imageId,
            sku,
            wholesalePrice,
            retailPrice,
            stock,
            weight,
            length,
            width,
            height,
            barcode,
            attributeValues,
          } = variationDto;

          // Vérifier l'unicité du SKU
          const existingVariation = await manager.findOne(ProductVariation, {
            where: { sku },
          });
          if (existingVariation) {
            throw new ConflictException(`Une variation avec le SKU ${sku} existe déjà`);
          }

          // Vérifier que l'image existe si fournie
          let variationImage: ImageProductEntity | undefined = undefined;
          if (imageId) {
            // ✅ Convertir en number si l'ID de ImageProductEntity est un number
            const imageIdNumber = parseInt(imageId, 10);
            if (isNaN(imageIdNumber)) {
              throw new BadRequestException(`ID d'image invalide: ${imageId}`);
            }

            const foundImage = await manager.findOne(ImageProductEntity, {
              where: { id: imageIdNumber },
            });
            if (!foundImage) {
              throw new NotFoundException(`Image avec l'ID ${imageId} non trouvée`);
            }
            variationImage = foundImage;
          }

          // Créer la variation
          const variation = manager.create(ProductVariation, {
            sku,
            wholesalePrice,
            retailPrice,
            stock,
            weight,
            length,
            width,
            height,
            barcode,
            product: savedProduct,
            image: variationImage,
          });

          const savedVariation = await manager.save(variation);

          // Créer les valeurs d'attributs si fournies
          if (Array.isArray(attributeValues) && attributeValues.length > 0) {
            const attributeValueEntities = attributeValues.map((attrValue) =>
              manager.create(VariationAttributeValue, {
                value: attrValue.value,
                attribute: { id: attrValue.attributeId },
                variation: savedVariation,
              }),
            );
            await manager.save(attributeValueEntities);
          }
        }
      }

      // 🔹 Recharger le produit avec toutes ses relations
      const productWithRelations = await manager.findOne(Product, {
        where: { id: savedProduct.id },
        relations: [
          'company',
          'category',
          'measure',
          'images',
          'specifications',
          'specifications.specification',
          'attributes',
          'attributes.attribute',
          'variations',
          'variations.image',
          'variations.attributeValues',
          'variations.attributeValues.attribute',
        ],
      });

      // 🔹 Sérialisation finale
      const serializedProduct = plainToInstance(Product, productWithRelations, {
        excludeExtraneousValues: true,
      });

      this.logger.log(
        ` Produit "${savedProduct.name}" créé avec succès avec ${variations?.length || 0} variations`,
      );

      return {
        message: 'Produit créé avec succès',
        data: serializedProduct!,
      };
    });
  }

  async update(
    id: string,
    dto: CreateProductDto,
    user: UserEntity,
    files?: Express.Multer.File[],
  ): Promise<{ message: string; data: Product }> {
    const {
      categoryId,
      status,
      measureId,
      specifications,
      attributes,
      variations, // ✅ Ajouter variations depuis le DTO
      ...data
    } = dto;

    this.logger.log(`🔄 Début mise à jour produit ID: ${id}`);

    // 🔹 Recherche du produit avec toutes ses relations
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
        'attributes',
        'attributes.attribute',
        'variations', // ✅ Ajouter les variations
        'variations.image',
        'variations.attributeValues',
        'variations.attributeValues.attribute',
      ],
    });

    if (!product) {
      this.logger.error(`❌ Produit non trouvé: ${id}`);
      throw new NotFoundException('Produit non trouvé');
    }

    // 🔹 Utilisation d'une transaction pour garantir l'intégrité
    return await this.dataSource.transaction(async (manager) => {
      try {
        this.logger.log(`📝 Mise à jour des données du produit: ${product.name}`);

        // 🔹 Mise à jour des champs de base
        if (status) product.status = status;
        Object.assign(product, data);

        // 🔹 Gestion de la catégorie
        if (categoryId) {
          const category = await manager.findOne(CategoryEntity, { where: { id: categoryId } });
          if (!category) {
            this.logger.warn(`❌ Catégorie non trouvée: ${categoryId}`);
            throw new NotFoundException('Catégorie non trouvée');
          }
          product.category = category;
          this.logger.log(`✅ Catégorie mise à jour: ${category.name}`);
        } else {
          product.category = undefined;
          this.logger.log('🗑️ Catégorie supprimée du produit');
        }

        // 🔹 Gestion de la mesure
        if (measureId) {
          const measure = await manager.findOne(MeasureEntity, { where: { id: measureId } });
          if (!measure) {
            this.logger.warn(`❌ Mesure non trouvée: ${measureId}`);
            throw new NotFoundException('Mesure non trouvée');
          }
          product.measure = measure;
          this.logger.log(`✅ Mesure mise à jour: ${measure.name}`);
        } else {
          product.measure = undefined;
          this.logger.log('🗑️ Mesure supprimée du produit');
        }

        // 🔹 Gestion des images si fournies
        if (files && files.length > 0) {
          this.logger.log(`📸 Upload de ${files.length} nouvelles images`);
          const newImages: ImageProductEntity[] = [];
          for (const file of files) {
            const url = await this.cloudinary.handleUploadImage(file, 'product');
            const img = manager.create(ImageProductEntity, { url, product });
            const savedImg = await manager.save(img);
            newImages.push(savedImg);
          }
          product.images = [...(product.images || []), ...newImages];
          this.logger.log(`✅ ${newImages.length} nouvelles images ajoutées`);
        }

        // 🔹 Sauvegarde du produit mis à jour
        const updatedProduct = await manager.save(product);
        this.logger.log(`✅ Produit sauvegardé: ${updatedProduct.name}`);

        // 🔹 Gestion des spécifications
        if (specifications && Array.isArray(specifications)) {
          this.logger.log(`⚙️ Mise à jour de ${specifications.length} spécifications`);

          // Supprimer les anciennes spécifications
          if (product.specificationValues && product.specificationValues.length > 0) {
            const oldSpecIds = product.specificationValues.map((sv) => sv.id);
            await manager.delete(ProductSpecificationValue, oldSpecIds);
            this.logger.log(`🗑️ ${oldSpecIds.length} anciennes spécifications supprimées`);
          }

          // Créer les nouvelles spécifications
          for (const spec of specifications) {
            if (!spec.specificationId) {
              throw new BadRequestException(
                'Chaque spécification doit contenir un specificationId',
              );
            }

            const specExists = await manager.findOne(Specification, {
              where: { id: spec.specificationId },
            });
            if (!specExists) {
              throw new BadRequestException(
                `La spécification avec id ${spec.specificationId} n'existe pas`,
              );
            }

            const specValue = manager.create(ProductSpecificationValue, {
              product: updatedProduct,
              specification: specExists,
              value: spec.value,
            });
            await manager.save(specValue);
          }
          this.logger.log('✅ Spécifications mises à jour');
        }

        // 🔹 Gestion des attributs
        if (attributes && Array.isArray(attributes)) {
          this.logger.log(`🏷️ Mise à jour de ${attributes.length} attributs`);

          // Supprimer les anciens attributs
          if (product.attributes && product.attributes.length > 0) {
            const oldAttrIds = product.attributes.map((pa) => pa.id);
            await manager.delete(ProductAttribute, oldAttrIds);
            this.logger.log(`🗑️ ${oldAttrIds.length} anciens attributs supprimés`);
          }

          // Créer les nouveaux attributs
          for (const attributeId of attributes) {
            const attribute = await manager.findOne(Attribute, {
              where: { id: attributeId },
            });
            if (!attribute) {
              throw new BadRequestException(
                `L'attribut avec l'ID ${attributeId} n'existe pas.`,
              );
            }

            const productAttribute = manager.create(ProductAttribute, {
              product: updatedProduct,
              attribute,
            });
            await manager.save(productAttribute);
          }
          this.logger.log('✅ Attributs mis à jour');
        }

        // 🔹 Gestion des variations de produit
        if (variations && Array.isArray(variations)) {
          this.logger.log(`🔄 Mise à jour de ${variations.length} variations`);

          // Supprimer les anciennes variations et leurs attributs
          if (product.variations && product.variations.length > 0) {
            for (const variation of product.variations) {
              // Supprimer d'abord les valeurs d'attributs
              if (variation.attributeValues && variation.attributeValues.length > 0) {
                const attrValueIds = variation.attributeValues.map((av) => av.id);
                await manager.delete(VariationAttributeValue, attrValueIds);
              }
              // Puis supprimer la variation
              await manager.delete(ProductVariation, variation.id);
            }
            this.logger.log(`🗑️ ${product.variations.length} anciennes variations supprimées`);
          }

          // Créer les nouvelles variations
          for (const variationDto of variations) {
            const {
              imageId,
              sku,
              wholesalePrice,
              retailPrice,
              stock,
              weight,
              length,
              width,
              height,
              barcode,
              attributeValues,
            } = variationDto;

            // Vérifier l'unicité du SKU
            const existingVariation = await manager.findOne(ProductVariation, {
              where: { sku },
            });
            if (existingVariation) {
              throw new ConflictException(`Une variation avec le SKU ${sku} existe déjà`);
            }

            // Gérer l'image de la variation
            let variationImage: ImageProductEntity | undefined = undefined;
            if (imageId) {
              const imageIdNumber = parseInt(imageId, 10);
              if (isNaN(imageIdNumber)) {
                throw new BadRequestException(`ID d'image invalide: ${imageId}`);
              }

              const foundImage = await manager.findOne(ImageProductEntity, {
                where: { id: imageIdNumber },
              });
              if (!foundImage) {
                throw new NotFoundException(`Image avec l'ID ${imageId} non trouvée`);
              }
              variationImage = foundImage;
            }

            // Créer la variation
            const variation = manager.create(ProductVariation, {
              sku,
              wholesalePrice,
              retailPrice,
              stock,
              weight,
              length,
              width,
              height,
              barcode,
              product: updatedProduct,
              image: variationImage,
            });

            const savedVariation = await manager.save(variation);

            // Créer les valeurs d'attributs si fournies
            if (Array.isArray(attributeValues) && attributeValues.length > 0) {
              const attributeValueEntities = attributeValues.map((attrValue) =>
                manager.create(VariationAttributeValue, {
                  value: attrValue.value,
                  attribute: { id: attrValue.attributeId },
                  variation: savedVariation,
                }),
              );
              await manager.save(attributeValueEntities);
            }

            this.logger.log(`✅ Variation créée: ${savedVariation.sku}`);
          }
          this.logger.log('✅ Toutes les variations mises à jour');
        }

        // 🔹 Recharger le produit avec toutes ses relations
        this.logger.log('🔄 Rechargement du produit mis à jour...');
        const productWithRelations = await manager.findOne(Product, {
          where: { id: updatedProduct.id },
          relations: [
            'category',
            'images',
            'measure',
            'company',
            'specificationValues',
            'specificationValues.specification',
            'attributes',
            'attributes.attribute',
            'variations',
            'variations.image',
            'variations.attributeValues',
            'variations.attributeValues.attribute',
          ],
        });

        this.logger.log(`🎉 Produit "${product.name}" mis à jour avec succès`);

        return {
          message: 'Produit mis à jour avec succès',
          data: productWithRelations!,
        };
      } catch (error) {
        this.logger.error(
          `💥 Erreur lors de la mise à jour du produit: ${error.message}`,
          error.stack,
        );
        throw error;
      }
    });
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
    if (!user || !user.id) {
      throw new BadRequestException('Utilisateur non trouvé ou non connecté');
    }

    if (!dto.productId) {
      throw new BadRequestException('productId est obligatoire');
    }

    const product = await this.productRepo.findOne({
      where: { id: dto.productId },
      relations: [
        'images',
        'category',
        'measure',
        'company',
        'company.tauxCompanies',
        'company.country',
        'company.city',
        'specificationValues',
        'specificationValues.specification',
        'attributes',
        'skus',
        'rentalContracts',
        'saleTransactions',
      ],
    });

    if (!product) throw new NotFoundException('Produit introuvable');

    // Vérifier si le produit est déjà dans la wishlist
    const existing = await this.wishlistRepo.findOne({
      where: { user: { id: user.id }, product: { id: product.id } },
    });

    if (existing) {
      // Supprimer si déjà présent
      await this.wishlistRepo.remove(existing);

      return {
        message: 'Produit retiré de la wishlist (existait déjà)',
        data: null, // ← data devient null
      };
    }

    // Créer et sauvegarder l'item
    const wishlistItem = this.wishlistRepo.create({
      user,
      product,
      deleted: false,
      status: true,
      shopType: dto.shopType,
    });

    await this.wishlistRepo.save(wishlistItem);

    // Retourner directement le produit
    return {
      message: 'Produit ajouté à la wishlist avec succès',
      data: product, // ← objet Product complet
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

    // Soft delete
    item.deleted = true;
    item.status = false;
    await this.wishlistRepo.save(item);

    // Retourner data null
    return {
      message: 'Produit retiré de la wishlist',
      data: null,
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
