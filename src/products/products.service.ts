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
import { CreateProductAdminDto } from './dto/create-product.admin.dto';
import { Brand } from './entities/brand.entity';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { slugify } from 'src/users/utility/slug/slugify';
import { UserPlatformRoleEntity } from 'src/users/entities/user_plateform_roles.entity';
import { NotificationsService } from 'src/notification/notifications.service';
import { UserRole } from 'src/users/enum/user-role-enum';
import { convertSpecValue } from 'src/users/utility/helpers/spec-value.util';
import { RoomAvailability } from 'src/HotelRoomAvailability/entity/RoomAvailability.entity';
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

    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,

    @InjectRepository(UserPlatformRoleEntity)
    private readonly userPlatformRoleRepo: Repository<UserPlatformRoleEntity>,

    private readonly notificationsService: NotificationsService,

    @InjectRepository(Specification)
    private specRepo: Repository<Specification>,

    @InjectRepository(Brand)
    private readonly brandRepository: Repository<Brand>,
  ) {}

  private readonly logger = new Logger(ProductService.name);

  async create(
    createProductDto: CreateProductDto,
    files: Express.Multer.File[],
    user: UserWithCompanyStatus,
  ): Promise<{ message: string; data: Product }> {
    const {
      categoryId,
      brandId,
      status,
      measureId,
      min_quantity,
      specifications,
      attributes,
      variations,
      ...data
    } = createProductDto;

    if (!files || files.length < 1 || files.length > 30) {
      throw new BadRequestException('Vous devez fournir entre 1 et 30 images.');
    }

    if (!user.activeCompanyId) {
      throw new BadRequestException('Aucune entreprise active trouvée pour cet utilisateur.');
    }

    const company = await this.companyRepo.findOne({ where: { id: user.activeCompanyId } });
    if (!company) throw new NotFoundException('Entreprise active introuvable.');

    let category: CategoryEntity | null = null;
    if (categoryId) {
      category = await this.categoryRepo.findOne({ where: { id: categoryId } });
      if (!category) throw new NotFoundException('Catégorie non trouvée.');
    }

    let brand: Brand | null = null;
    if (brandId) {
      brand = await this.brandRepository.findOne({ where: { id: brandId } });
      if (!brand) throw new NotFoundException(`Marque avec l'ID ${brandId} non trouvée.`);
    }

    let measure: MeasureEntity | null = null;
    if (measureId) {
      measure = await this.measureRepo.findOne({ where: { id: measureId } });
      if (!measure) throw new NotFoundException('Mesure non trouvée.');
    }

    if (
      (company.companyActivity === CompanyActivity.WHOLESALER ||
        company.companyActivity === CompanyActivity.WHOLESALER_RETAILER) &&
      (min_quantity === undefined || min_quantity === null)
    ) {
      throw new BadRequestException(
        'Le champ "min_quantity" est obligatoire pour les entreprises de type grossiste ou mixte.',
      );
    }

    const productStatus = status || ProductStatus.PENDING;

    return await this.dataSource.transaction(async (manager) => {
      const product = manager.create(Product, {
        ...data,
        min_quantity: min_quantity ?? 0,
        company,
        category,
        brand,
        measure,
        type: company.typeCompany,
        status: productStatus,
        companyActivity: company.companyActivity,
      } as DeepPartial<Product>);

      const savedProduct = await manager.save(product);

      const uploadedImages: string[] = [];
      for (const file of files) {
        const uploadedUrl = await this.cloudinary.handleUploadImage(file, 'product');
        uploadedImages.push(uploadedUrl);
      }

      const imageEntities: ImageProductEntity[] = [];
      for (const url of uploadedImages) {
        const imageEntity = manager.create(ImageProductEntity, {
          url,
          product: savedProduct,
        });
        const savedImage = await manager.save(imageEntity);
        imageEntities.push(savedImage);
      }

      // 🔸 3. Définir la première image comme image principale du produit
      if (imageEntities.length > 0) {
        savedProduct.image = imageEntities[0].url;
        await manager.save(savedProduct);
      }

      // 🔸 4. Gestion des spécifications
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

      // 🔸 5. Gestion des attributs
      if (attributes && Array.isArray(attributes)) {
        for (const attributeId of attributes) {
          const attribute = await manager.findOne(Attribute, { where: { id: attributeId } });
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

      // 🔸 6. Variations
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

          const existingVariation = await manager.findOne(ProductVariation, {
            where: { sku },
          });
          if (existingVariation) {
            throw new ConflictException(`Une variation avec le SKU ${sku} existe déjà`);
          }

          let variationImage: ImageProductEntity | undefined;
          if (imageId) {
            const foundImage = await manager.findOne(ImageProductEntity, {
              where: { id: parseInt(imageId, 10) },
            });
            if (!foundImage) {
              throw new NotFoundException(`Image avec l'ID ${imageId} non trouvée`);
            }
            variationImage = foundImage;
          }

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

      const finalProduct = await manager.findOne(Product, {
        where: { id: savedProduct.id },
        relations: [
          'company',
          'company.country',
          'category',
          'brand',
          'measure',
          'images',
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

      if (!finalProduct) {
        throw new NotFoundException('Produit non trouvé après création');
      }

      // 🔸 8. S'assurer que les images sont bien attachées
      finalProduct.images = imageEntities;

      // 🔸 8.5 Génération RoomAvailability si hôtel
      if (finalProduct.category?.name?.toLowerCase() === 'hotel') {
        const DEFAULT_ROOMS = 10;
        const daysToGenerate = 90;

        const today = new Date();
        const availabilityList: RoomAvailability[] = [];

        for (let i = 0; i < daysToGenerate; i++) {
          const date = new Date(today);
          date.setDate(date.getDate() + i);

          const formattedDate = date.toISOString().split('T')[0];

          const availability = manager.create(RoomAvailability, {
            product: finalProduct,
            date: formattedDate,
            roomsAvailable: DEFAULT_ROOMS,
            roomsBooked: 0,
            roomsRemaining: DEFAULT_ROOMS,
          });

          availabilityList.push(availability);
        }

        await manager.save(availabilityList);

        this.logger.log(
          `RoomAvailability généré automatiquement pour ${daysToGenerate} jours pour le produit hôtel : ${finalProduct.name}`,
        );
      }

      this.logger.log(`Produit "${finalProduct.name}" créé avec succès.`);

      return {
        message: 'Produit créé avec succès.',
        data: finalProduct, // Retourne l'objet complet avec toutes les relations
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
      brandId,
      status,
      measureId,
      specifications,
      attributes,
      variations,
      ...data
    } = dto;

    // 🔹 Recherche du produit avec toutes ses relations
    const product = await this.productRepo.findOne({
      where: { id },
      relations: [
        'category',
        'images',
        'brand',
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

    if (!product) {
      throw new NotFoundException('Produit non trouvé');
    }

    // 🔹 Utilisation d'une transaction pour garantir l'intégrité
    return await this.dataSource.transaction(async (manager) => {
      try {
        // 🔹 Mise à jour des champs de base
        Object.assign(product, data);

        // 🔹 Gestion de la catégorie
        if (categoryId) {
          const category = await manager.findOne(CategoryEntity, { where: { id: categoryId } });
          if (!category) throw new NotFoundException('Catégorie non trouvée');
          product.category = category;
        } else {
          product.category = undefined;
        }

        // 🔹 Gestion de la marque
        if (brandId) {
          const brand = await manager.findOne(Brand, { where: { id: brandId } });
          if (!brand) throw new NotFoundException('Marque non trouvée');
          product.brand = brand;
        } else {
          product.brand = undefined;
        }

        // 🔹 Gestion de la mesure
        if (measureId) {
          const measure = await manager.findOne(MeasureEntity, { where: { id: measureId } });
          if (!measure) throw new NotFoundException('Mesure non trouvée');
          product.measure = measure;
        } else {
          product.measure = undefined;
        }

        // 🔹 Gestion des images si fournies
        if (files && files.length > 0) {
          const newImages: ImageProductEntity[] = [];
          for (const file of files) {
            const url = await this.cloudinary.handleUploadImage(file, 'product');
            const img = manager.create(ImageProductEntity, { url, product });
            const savedImg = await manager.save(img);
            newImages.push(savedImg);
          }
          product.images = [...(product.images || []), ...newImages];
        }

        // 🔹 Sauvegarde du produit mis à jour
        const updatedProduct = await manager.save(product);

        // 🔹 Gestion des SPÉCIFICATIONS - SUPPRIMER PUIS CRÉER (CORRIGÉ)
        if (specifications !== undefined) {
          // 🔹 1. SUPPRIMER TOUTES les anciennes spécifications
          await manager.delete(ProductSpecificationValue, { product: { id } });

          // 🔹 2. CRÉER les nouvelles spécifications avec TypeORM (pas de SQL direct)
          if (Array.isArray(specifications) && specifications.length > 0) {
            const specValuesToSave: ProductSpecificationValue[] = [];

            for (const spec of specifications) {
              if (!spec.specificationId) {
                throw new BadRequestException(
                  'Chaque spécification doit contenir un specificationId',
                );
              }

              // Vérifier que la spécification existe
              const specExists = await manager.findOne(Specification, {
                where: { id: spec.specificationId },
              });
              if (!specExists) {
                throw new BadRequestException(
                  `La spécification avec id ${spec.specificationId} n'existe pas`,
                );
              }

              // 🔹 CORRECTION : Utiliser TypeORM pour créer l'entité (génération auto de l'ID)
              const specValue = manager.create(ProductSpecificationValue, {
                product: { id } as Product,
                specification: specExists,
                value: spec.value || undefined,
              });

              specValuesToSave.push(specValue);
            }

            // Sauvegarder en une seule opération
            await manager.save(ProductSpecificationValue, specValuesToSave);
          }
        }

        // 🔹 Gestion des attributs
        if (attributes && Array.isArray(attributes)) {
          // Supprimer les anciens attributs
          await manager.delete(ProductAttribute, { product: { id } });

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
        }

        // 🔹 Gestion des variations de produit
        if (variations && Array.isArray(variations)) {
          // Supprimer les anciennes variations
          await manager.delete(ProductVariation, { product: { id } });

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
          }
        }

        // 🔹 Recharger le produit avec toutes ses relations
        const productWithRelations = await manager.findOne(Product, {
          where: { id: updatedProduct.id },
          relations: [
            'category',
            'brand',
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

        return {
          message: 'Produit mis à jour avec succès',
          data: productWithRelations!,
        };
      } catch (error) {
        this.logger.error(`Erreur lors de la mise à jour du produit: ${error.message}`);
        throw error;
      }
    });
  }

  async createProduct(
    createProductAdminDto: CreateProductAdminDto,
    files: Express.Multer.File[],
    user: UserWithCompanyStatus,
  ): Promise<{ message: string; data: Product }> {
    const {
      categoryId,
      brandId,
      companyId,
      status,
      measureId,
      min_quantity,
      specifications,
      attributes,
      variations,
      ...data
    } = createProductAdminDto;

    // 🔹 Validation images
    if (!files || files.length < 1 || files.length > 30) {
      throw new BadRequestException('Vous devez fournir entre 1 et 30 images.');
    }

    // 🔹 Validation entreprise
    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Entreprise introuvable.');

    // 🔹 Récupération catégorie
    let category: CategoryEntity | null = null;
    if (categoryId) {
      category = await this.categoryRepo.findOne({ where: { id: categoryId } });
      if (!category) throw new NotFoundException('Catégorie non trouvée.');
    }

    // 🔹 Récupération marque
    let brand: Brand | null = null;
    if (brandId) {
      brand = await this.brandRepository.findOne({ where: { id: brandId } });
      if (!brand) throw new NotFoundException('Marque non trouvée.');
    }

    // 🔹 Récupération mesure
    let measure: MeasureEntity | null = null;
    if (measureId) {
      measure = await this.measureRepo.findOne({ where: { id: measureId } });
      if (!measure) throw new NotFoundException('Mesure non trouvée.');
    }

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

    const productStatus = status || ProductStatus.PENDING;

    // 🔹 Transaction
    return await this.dataSource.transaction(async (manager) => {
      // 🔸 1. Créer le produit (sans image principale pour l'instant)
      const product = manager.create(Product, {
        ...data,
        min_quantity: min_quantity ?? 0,
        company,
        category,
        brand,
        measure,
        type: company.typeCompany,
        status: productStatus,
        companyActivity: company.companyActivity,
      } as DeepPartial<Product>);

      const savedProduct = await manager.save(product);

      // 🔸 2. Upload des images dans Cloudinary + enregistrement dans ImageProductEntity
      const uploadedImages: string[] = [];
      for (const file of files) {
        const uploadedUrl = await this.cloudinary.handleUploadImage(file, 'product');
        uploadedImages.push(uploadedUrl);
      }

      const imageEntities: ImageProductEntity[] = [];
      for (const url of uploadedImages) {
        const imageEntity = manager.create(ImageProductEntity, {
          url,
          product: savedProduct,
        });
        const savedImage = await manager.save(imageEntity);
        imageEntities.push(savedImage);
      }

      // 🔸 3. Définir la première image comme image principale du produit
      if (imageEntities.length > 0) {
        savedProduct.image = imageEntities[0].url;
        await manager.save(savedProduct);
      }

      // 🔸 4. Spécifications
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

          const formattedValue = convertSpecValue(specification.type, spec.value);

          const specValue = manager.create(ProductSpecificationValue, {
            product: savedProduct,
            specification,
            value: formattedValue,
          });

          await manager.save(specValue);
        }
      }

      // 🔸 5. Attributs
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

      // 🔸 6. Variations
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

          const existingVariation = await manager.findOne(ProductVariation, { where: { sku } });
          if (existingVariation) {
            throw new ConflictException(`Une variation avec le SKU ${sku} existe déjà.`);
          }

          let variationImage: ImageProductEntity | undefined;
          if (imageId) {
            const imageIdNumber = parseInt(imageId, 10);
            if (isNaN(imageIdNumber)) {
              throw new BadRequestException(`ID d'image invalide: ${imageId}`);
            }

            const foundImage = await manager.findOne(ImageProductEntity, {
              where: { id: imageIdNumber },
            });
            if (!foundImage) {
              throw new NotFoundException(`Image avec l'ID ${imageId} non trouvée.`);
            }
            variationImage = foundImage;
          }

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

      // 🔸 7. Charger le produit complet avec ses relations
      const finalProduct = await manager.findOne(Product, {
        where: { id: savedProduct.id },
        relations: [
          'company',
          'company.country',
          'company.city',
          'category',
          'brand',
          'measure',
          'images',
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

      if (!finalProduct) {
        throw new NotFoundException('Produit non trouvé après création');
      }

      // 🔸 8. S'assurer que les images sont bien attachées
      finalProduct.images = imageEntities;

      this.logger.log(`Produit "${finalProduct.name}" créé avec succès.`);

      return {
        message: 'Produit créé avec succès.',
        data: finalProduct, // Retourne l'objet complet avec toutes les relations
      };
    });
  }

  async updateProduct(
    id: string,
    dto: CreateProductAdminDto,
    files?: Express.Multer.File[],
  ): Promise<{ message: string; data: Product }> {
    const {
      categoryId,
      brandId,
      companyId,
      measureId,
      specifications,
      attributes,
      variations,
      ...data
    } = dto;

    // 🔹 Recherche du produit avec toutes ses relations
    const product = await this.productRepo.findOne({
      where: { id },
      relations: [
        'category',
        'images',
        'measure',
        'brand',
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

    if (!product) {
      throw new NotFoundException('Produit non trouvé');
    }

    // 🔹 Utilisation d'une transaction pour garantir l'intégrité
    return await this.dataSource.transaction(async (manager) => {
      try {
        // 🔹 Mise à jour des champs de base
        Object.assign(product, data);

        // 🔹 Gestion de la catégorie
        if (categoryId) {
          const category = await manager.findOne(CategoryEntity, { where: { id: categoryId } });
          if (!category) throw new NotFoundException('Catégorie non trouvée');
          product.category = category;
        } else {
          product.category = undefined;
        }

        // 🔹 Gestion de la marque
        if (brandId) {
          const brand = await manager.findOne(Brand, { where: { id: brandId } });
          if (!brand) throw new NotFoundException('Marque non trouvée');
          product.brand = brand;
        } else {
          product.brand = undefined;
        }

        // 🔹 Gestion de la mesure
        if (measureId) {
          const measure = await manager.findOne(MeasureEntity, { where: { id: measureId } });
          if (!measure) throw new NotFoundException('Mesure non trouvée');
          product.measure = measure;
        } else {
          product.measure = undefined;
        }

        // 🔹 Gestion des images si fournies
        if (files && files.length > 0) {
          const newImages: ImageProductEntity[] = [];
          for (const file of files) {
            const url = await this.cloudinary.handleUploadImage(file, 'product');
            const img = manager.create(ImageProductEntity, { url, product });
            const savedImg = await manager.save(img);
            newImages.push(savedImg);
          }
          product.images = [...(product.images || []), ...newImages];
        }

        // 🔹 Sauvegarde du produit mis à jour
        const updatedProduct = await manager.save(product);

        // 🔹 Gestion des SPÉCIFICATIONS - SUPPRIMER PUIS CRÉER (CORRIGÉ)
        if (specifications !== undefined) {
          // 🔹 1. SUPPRIMER TOUTES les anciennes spécifications
          await manager.delete(ProductSpecificationValue, { product: { id } });

          // 🔹 2. CRÉER les nouvelles spécifications avec TypeORM (pas de SQL direct)
          if (Array.isArray(specifications) && specifications.length > 0) {
            const specValuesToSave: ProductSpecificationValue[] = [];

            for (const spec of specifications) {
              if (!spec.specificationId) {
                throw new BadRequestException(
                  'Chaque spécification doit contenir un specificationId',
                );
              }

              // Vérifier que la spécification existe
              const specExists = await manager.findOne(Specification, {
                where: { id: spec.specificationId },
              });
              if (!specExists) {
                throw new BadRequestException(
                  `La spécification avec id ${spec.specificationId} n'existe pas`,
                );
              }

              // 🔹 CORRECTION : Utiliser TypeORM pour créer l'entité (génération auto de l'ID)
              const specValue = manager.create(ProductSpecificationValue, {
                product: { id } as Product,
                specification: specExists,
                value: spec.value || undefined,
              });

              specValuesToSave.push(specValue);
            }

            // Sauvegarder en une seule opération
            await manager.save(ProductSpecificationValue, specValuesToSave);
          }
        }

        // 🔹 Gestion des attributs
        if (attributes && Array.isArray(attributes)) {
          // Supprimer les anciens attributs
          await manager.delete(ProductAttribute, { product: { id } });

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
        }

        // 🔹 Gestion des variations
        if (variations && Array.isArray(variations)) {
          // Supprimer les anciennes variations
          await manager.delete(ProductVariation, { product: { id } });

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
          }
        }

        // 🔹 Recharger le produit avec toutes ses relations
        const productWithRelations = await manager.findOne(Product, {
          where: { id: updatedProduct.id },
          relations: [
            'category',
            'images',
            'measure',
            'company',
            'brand',
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

        return {
          message: 'Produit mis à jour avec succès',
          data: productWithRelations!,
        };
      } catch (error) {
        this.logger.error(`Erreur lors de la mise à jour du produit: ${error.message}`);
        throw error;
      }
    });
  }
  async findOne(id: string): Promise<{ message: string; data: Product }> {
    const product = await this.productRepo.findOne({
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
        'company.tauxCompanies',
        'company.country',
        'company.city',
        'specificationValues',
        'specificationValues.specification',
        'attributes',
        'attributes.attribute',
        'variations',
        'variations.image',
        'variations.attributeValues',
        'variations.attributeValues.attribute',
        'brand',
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
      .leftJoinAndSelect('product.brand', 'brand')
      .leftJoinAndSelect('company.tauxCompanies', 'tauxCompanies')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('category.parent', 'categoryParent')
      .leftJoinAndSelect('category.children', 'categoryChildren')
      .leftJoinAndSelect('product.images', 'images')
      .leftJoinAndSelect('product.measure', 'measure')
      .leftJoinAndSelect('product.specificationValues', 'specificationValues')
      .leftJoinAndSelect('specificationValues.specification', 'specification')
      .leftJoinAndSelect('product.attributes', 'attributes')
      .leftJoinAndSelect('attributes.attribute', 'attribute')
      .leftJoinAndSelect('product.variations', 'variations')
      .leftJoinAndSelect('variations.image', 'variationImage')
      .leftJoinAndSelect('variations.attributeValues', 'variationAttributeValues')
      .leftJoinAndSelect('variationAttributeValues.attribute', 'variationAttribute');

    if (type) {
      queryBuilder.where('product.type = :type', { type });
    }

    queryBuilder.orderBy('product.createdAt', 'DESC');

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
      .leftJoinAndSelect('product.brand', 'brand')
      .leftJoinAndSelect('company.tauxCompanies', 'tauxCompanies')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('category.parent', 'categoryParent')
      .leftJoinAndSelect('category.children', 'categoryChildren')
      .leftJoinAndSelect('product.images', 'images')
      .leftJoinAndSelect('product.measure', 'measure')
      .leftJoinAndSelect('product.specificationValues', 'specificationValues')
      .leftJoinAndSelect('specificationValues.specification', 'specification')
      .leftJoinAndSelect('product.attributes', 'attributes')
      .leftJoinAndSelect('attributes.attribute', 'attribute')
      .leftJoinAndSelect('product.variations', 'variations')
      .leftJoinAndSelect('variations.image', 'variationImage')
      .leftJoinAndSelect('variations.attributeValues', 'variationAttributeValues')
      .leftJoinAndSelect('variationAttributeValues.attribute', 'variationAttribute')

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
      .leftJoinAndSelect('product.brand', 'brand')
      .leftJoinAndSelect('product.specificationValues', 'specificationValues')
      .leftJoinAndSelect('specificationValues.specification', 'specification')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('company.city', 'city')
      .leftJoinAndSelect('company.tauxCompanies', 'tauxCompanies')
      .leftJoinAndSelect('product.attributes', 'attributes')
      .leftJoinAndSelect('attributes.attribute', 'attribute')
      .leftJoinAndSelect('product.variations', 'variations')
      .leftJoinAndSelect('variations.image', 'variationImage')
      .leftJoinAndSelect('variations.attributeValues', 'variationAttributeValues')
      .leftJoinAndSelect('variationAttributeValues.attribute', 'variationAttribute')

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

  // async findProductPublishedByCategory(
  //   categoryId?: string,
  //   brandId?: string,
  //   shopType?: string,
  //   fuelType?: FuelType,
  //   transmission?: Transmission,
  //   typecar?: Type_rental_both_sale_car,
  //   year?: string,
  //   yearStart?: number,
  //   yearEnd?: number,
  //   type?: string,
  //   companyId?: string,
  //   minDailyRate?: number,
  //   maxDailyRate?: number,
  //   minSalePrice?: number,
  //   maxSalePrice?: number,
  //   page = 1,
  //   limit = 10,
  // ): Promise<{
  //   message: string;
  //   data: {
  //     data: Product[];
  //     total: number;
  //     page: number;
  //     limit: number;
  //   };
  // }> {
  //   const queryBuilder = this.productRepo
  //     .createQueryBuilder('product')
  //     .leftJoinAndSelect('product.category', 'category')
  //     .leftJoinAndSelect('product.specificationValues', 'specificationValues')
  //     .leftJoinAndSelect('specificationValues.specification', 'specification')
  //     .leftJoinAndSelect('category.parent', 'categoryParent')
  //     .leftJoinAndSelect('category.children', 'categoryChildren')
  //     .leftJoinAndSelect('product.images', 'images')
  //     .leftJoinAndSelect('product.measure', 'measure')
  //     .leftJoinAndSelect('product.company', 'company')
  //     .leftJoinAndSelect('product.brand', 'brand')
  //     .leftJoinAndSelect('company.country', 'country')
  //     .leftJoinAndSelect('company.city', 'city')
  //     .leftJoinAndSelect('company.tauxCompanies', 'tauxCompanies')
  //     .leftJoinAndSelect('product.attributes', 'attributes')
  //     .leftJoinAndSelect('attributes.attribute', 'attribute')
  //     .leftJoinAndSelect('product.variations', 'variations')
  //     .leftJoinAndSelect('variations.image', 'variationImage')
  //     .leftJoinAndSelect('variations.attributeValues', 'variationAttributeValues')
  //     .leftJoinAndSelect('variationAttributeValues.attribute', 'variationAttribute')

  //     .where('product.status = :status', { status: ProductStatus.PUBLISHED });

  //   // 🔸 Filtre companyId
  //   if (companyId) {
  //     queryBuilder.andWhere('product.companyId = :companyId', { companyId });
  //   }

  //   if (brandId) {
  //     queryBuilder.andWhere('product.brandId = :brandId', { brandId });
  //   }

  //   // 🔸 Filtre catégorie
  //   if (categoryId) {
  //     queryBuilder.andWhere(
  //       '(category.id = :categoryId OR categoryParent.id = :categoryId OR categoryChildren.id = :categoryId)',
  //       { categoryId },
  //     );
  //   }

  //   // 🔸 Filtre type produit
  //   if (type) {
  //     queryBuilder.andWhere('product.type = :type', { type });
  //   }

  //   // 🔸 Filtre shopType avec logique WHOLESALER / RETAILER / WHOLESALER_RETAILER
  //   if (shopType?.trim()) {
  //     if (shopType === CompanyActivity.WHOLESALER) {
  //       queryBuilder.andWhere('product.companyActivity IN (:...activities)', {
  //         activities: [CompanyActivity.WHOLESALER, CompanyActivity.WHOLESALER_RETAILER],
  //       });

  //       queryBuilder.andWhere(
  //         '(product.gros_price_original IS NOT NULL AND product.gros_price_original > 0)',
  //       );
  //     } else if (shopType === CompanyActivity.RETAILER) {
  //       queryBuilder.andWhere('product.companyActivity IN (:...activities)', {
  //         activities: [CompanyActivity.RETAILER, CompanyActivity.WHOLESALER_RETAILER],
  //       });

  //       queryBuilder.andWhere(
  //         '(product.detail_price_original IS NOT NULL AND product.detail_price_original > 0)',
  //       );
  //     } else if (shopType === CompanyActivity.WHOLESALER_RETAILER) {
  //       queryBuilder.andWhere('product.companyActivity IN (:...activities)', {
  //         activities: [
  //           CompanyActivity.WHOLESALER_RETAILER,
  //           CompanyActivity.WHOLESALER,
  //           CompanyActivity.RETAILER,
  //         ],
  //       });

  //       queryBuilder.andWhere(
  //         '((product.gros_price_original IS NOT NULL AND product.gros_price_original > 0) OR (product.detail_price_original IS NOT NULL AND product.detail_price_original > 0))',
  //       );
  //     }
  //   }

  //   // 🔸 Filtre fuelType
  //   if (fuelType) {
  //     queryBuilder.andWhere('product.fuelType = :fuelType', { fuelType });
  //   }

  //   // 🔸 Filtre transmission
  //   if (transmission) {
  //     queryBuilder.andWhere('product.transmission = :transmission', { transmission });
  //   }

  //   // 🔸 Filtre année
  //   if (year) {
  //     queryBuilder.andWhere('product.year = :year', { year });
  //   }

  //   if (yearStart !== undefined || yearEnd !== undefined) {
  //     if (yearStart !== undefined && yearEnd !== undefined) {
  //       queryBuilder.andWhere(
  //         'CAST(product.year AS UNSIGNED) BETWEEN :yearStart AND :yearEnd',
  //         { yearStart, yearEnd },
  //       );
  //     } else if (yearStart !== undefined) {
  //       queryBuilder.andWhere('CAST(product.year AS UNSIGNED) >= :yearStart', { yearStart });
  //     } else if (yearEnd !== undefined) {
  //       queryBuilder.andWhere('CAST(product.year AS UNSIGNED) <= :yearEnd', { yearEnd });
  //     }
  //   }

  //   // 🔸 Filtre prix & typecar
  //   if (typecar) {
  //     if (typecar === Type_rental_both_sale_car.SALE) {
  //       if (minSalePrice !== undefined)
  //         queryBuilder.andWhere('product.salePrice >= :minSalePrice', { minSalePrice });
  //       if (maxSalePrice !== undefined)
  //         queryBuilder.andWhere('product.salePrice <= :maxSalePrice', { maxSalePrice });
  //       queryBuilder.andWhere('product.typecar = :typecar', {
  //         typecar: Type_rental_both_sale_car.SALE,
  //       });
  //     } else if (typecar === Type_rental_both_sale_car.RENTAL) {
  //       if (minDailyRate !== undefined)
  //         queryBuilder.andWhere('product.dailyRate >= :minDailyRate', { minDailyRate });
  //       if (maxDailyRate !== undefined)
  //         queryBuilder.andWhere('product.dailyRate <= :maxDailyRate', { maxDailyRate });
  //       queryBuilder.andWhere('product.typecar = :typecar', {
  //         typecar: Type_rental_both_sale_car.RENTAL,
  //       });
  //     } else if (typecar === Type_rental_both_sale_car.BOTH) {
  //       if (minSalePrice !== undefined)
  //         queryBuilder.andWhere('product.salePrice >= :minSalePrice', { minSalePrice });
  //       if (maxSalePrice !== undefined)
  //         queryBuilder.andWhere('product.salePrice <= :maxSalePrice', { maxSalePrice });
  //       if (minDailyRate !== undefined)
  //         queryBuilder.andWhere('product.dailyRate >= :minDailyRate', { minDailyRate });
  //       if (maxDailyRate !== undefined)
  //         queryBuilder.andWhere('product.dailyRate <= :maxDailyRate', { maxDailyRate });
  //       queryBuilder.andWhere('product.typecar = :typecar', {
  //         typecar: Type_rental_both_sale_car.BOTH,
  //       });
  //     }
  //   }

  //   //  Tri par date
  //   queryBuilder.orderBy('product.createdAt', 'DESC');

  //   //  Pagination
  //   if (limit > 0) {
  //     queryBuilder.skip((page - 1) * limit).take(limit);
  //   }

  //   const [products, total] = await queryBuilder.getManyAndCount();

  //   return {
  //     message: 'Produits PUBLIÉS récupérés avec succès.',
  //     data: { data: products, total, page, limit },
  //   };
  // }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async findProductPublishedByCategory(
    categoryId?: string,
    brandId?: string,
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
    data: { data: Product[]; total: number; page: number; limit: number };
  }> {
    const queryBuilder = this.productRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('category.parent', 'categoryParent')
      .leftJoinAndSelect('category.children', 'categoryChildren')
      .leftJoinAndSelect('product.images', 'images')
      .leftJoinAndSelect('product.measure', 'measure')
      .leftJoinAndSelect('product.company', 'company')
      .leftJoinAndSelect('product.brand', 'brand')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('company.city', 'city')
      .leftJoinAndSelect('company.tauxCompanies', 'tauxCompanies')
      .leftJoinAndSelect('product.specificationValues', 'specificationValues')
      .leftJoinAndSelect('specificationValues.specification', 'specification')
      .leftJoinAndSelect('product.attributes', 'attributes')
      .leftJoinAndSelect('attributes.attribute', 'attribute')
      .leftJoinAndSelect('product.variations', 'variations')
      .leftJoinAndSelect('variations.image', 'variationImage')
      .leftJoinAndSelect('variations.attributeValues', 'variationAttributeValues')
      .leftJoinAndSelect('variationAttributeValues.attribute', 'variationAttribute')
      .where('product.status = :status', { status: ProductStatus.PUBLISHED });

    // Filtre brandId
    if (brandId) {
      queryBuilder.andWhere('product.brand_id = :brandId', { brandId });
    }

    // Filtre companyId
    if (companyId) {
      queryBuilder.andWhere('product.companyId = :companyId', { companyId });
    }

    // Filtre catégorie
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
      const activities: string[] = [];
      if (shopType === CompanyActivity.WHOLESALER)
        activities.push(CompanyActivity.WHOLESALER, CompanyActivity.WHOLESALER_RETAILER);
      if (shopType === CompanyActivity.RETAILER)
        activities.push(CompanyActivity.RETAILER, CompanyActivity.WHOLESALER_RETAILER);
      if (shopType === CompanyActivity.WHOLESALER_RETAILER)
        activities.push(
          CompanyActivity.WHOLESALER,
          CompanyActivity.RETAILER,
          CompanyActivity.WHOLESALER_RETAILER,
        );

      queryBuilder.andWhere('product.companyActivity IN (:...activities)', { activities });

      if (shopType === CompanyActivity.WHOLESALER)
        queryBuilder.andWhere('product.gros_price_original > 0');
      if (shopType === CompanyActivity.RETAILER)
        queryBuilder.andWhere('product.detail_price_original > 0');
      if (shopType === CompanyActivity.WHOLESALER_RETAILER)
        queryBuilder.andWhere(
          '(product.gros_price_original > 0 OR product.detail_price_original > 0)',
        );
    }

    // Filtre fuelType
    if (fuelType) queryBuilder.andWhere('product.fuelType = :fuelType', { fuelType });

    // Filtre transmission
    if (transmission)
      queryBuilder.andWhere('product.transmission = :transmission', { transmission });

    // Filtre année
    if (year) queryBuilder.andWhere('product.year = :year', { year });
    if (yearStart !== undefined || yearEnd !== undefined) {
      if (yearStart !== undefined && yearEnd !== undefined)
        queryBuilder.andWhere(
          'CAST(product.year AS UNSIGNED) BETWEEN :yearStart AND :yearEnd',
          { yearStart, yearEnd },
        );
      else if (yearStart !== undefined)
        queryBuilder.andWhere('CAST(product.year AS UNSIGNED) >= :yearStart', { yearStart });
      else if (yearEnd !== undefined)
        queryBuilder.andWhere('CAST(product.year AS UNSIGNED) <= :yearEnd', { yearEnd });
    }

    // Filtre typecar / prix
    if (typecar) {
      if (
        [
          Type_rental_both_sale_car.SALE,
          Type_rental_both_sale_car.RENTAL,
          Type_rental_both_sale_car.BOTH,
        ].includes(typecar)
      ) {
        if (
          [Type_rental_both_sale_car.SALE, Type_rental_both_sale_car.BOTH].includes(typecar)
        ) {
          if (minSalePrice !== undefined)
            queryBuilder.andWhere('product.salePrice >= :minSalePrice', { minSalePrice });
          if (maxSalePrice !== undefined)
            queryBuilder.andWhere('product.salePrice <= :maxSalePrice', { maxSalePrice });
        }
        if (
          [Type_rental_both_sale_car.RENTAL, Type_rental_both_sale_car.BOTH].includes(typecar)
        ) {
          if (minDailyRate !== undefined)
            queryBuilder.andWhere('product.dailyRate >= :minDailyRate', { minDailyRate });
          if (maxDailyRate !== undefined)
            queryBuilder.andWhere('product.dailyRate <= :maxDailyRate', { maxDailyRate });
        }
        queryBuilder.andWhere('product.typecar = :typecar', { typecar });
      }
    }

    // Tri par date
    queryBuilder.orderBy('product.createdAt', 'DESC');

    // Pagination
    if (limit > 0) queryBuilder.skip((page - 1) * limit).take(limit);

    const [products, total] = await queryBuilder.getManyAndCount();

    return {
      message: 'Produits PUBLIÉS récupérés avec succès.',
      data: { data: products, total, page, limit },
    };
  }

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
        'brand',
        'images',
        'measure',
        'company.tauxCompanies',
        'company.country',
        'company.city',
        'specificationValues',
        'specificationValues.specification',
        'attributes',
        'attributes.attribute',
        'variations',
        'variations.image',
        'variations.attributeValues',
        'variations.attributeValues.attribute',
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
        'brand',
        'measure',
        'company',
        'company.tauxCompanies',
        'company.country',
        'company.city',
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
        'brand',
        'company.tauxCompanies',
        'company.country',
        'company.city',
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
        'brand',
        'company.tauxCompanies',
        'company.country',
        'company.city',
        'specificationValues',
        'specificationValues.specification',
        'attributes',
        'attributes.attribute',
        'variations',
        'variations.image',
        'variations.attributeValues',
        'variations.attributeValues.attribute',
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
    // 🛑 Si aucun mot-clé n’est fourni → on ne retourne rien
    if (!search || search.trim() === '') {
      return {
        message: 'Veuillez entrer un mot-clé pour effectuer la recherche.',
        data: [],
      };
    }

    const qb = this.productRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.company', 'company')
      .leftJoinAndSelect('product.specificationValues', 'specificationValues')
      .leftJoinAndSelect('specificationValues.specification', 'specification')
      .leftJoinAndSelect('company.tauxCompanies', 'tauxCompanies')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('company.city', 'city')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.images', 'images')
      .leftJoinAndSelect('product.brand', 'brand')
      .leftJoinAndSelect('product.attributes', 'attributes')
      .leftJoinAndSelect('attributes.attribute', 'attribute')
      .leftJoinAndSelect('product.variations', 'variations')
      .leftJoinAndSelect('variations.image', 'variationImage')
      .leftJoinAndSelect('variations.attributeValues', 'variationAttributeValues')
      .leftJoinAndSelect('variationAttributeValues.attribute', 'variationAttribute')
      .where('product.status = :status', { status: ProductStatus.PUBLISHED }); // ✅ Filtrer uniquement les produits publiés

    // 🔍 Recherche si un mot-clé est fourni
    qb.andWhere(
      `(product.name LIKE :search
      OR product.type LIKE :search
      OR category.name LIKE :search
      OR company.companyName LIKE :search
      OR product.description LIKE :search)`,
      { search: `%${search}%` },
    );

    const results = await qb.orderBy('product.createdAt', 'DESC').getMany();

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
        'brand',
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
        'brand',
        'company.tauxCompanies',
        'company.country',
        'company.city',
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
        'company',
        'category',
        'measure',
        'images',
        'brand',
        'company.tauxCompanies',
        'company.country',
        'company.city',
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
        'product.brand',
        'product.company',
        'product.company.tauxCompanies',
        'product.company.country',
        'product.company.city',

        // 🔹 Spécifications & Attributs
        'product.specificationValues',
        'product.specificationValues.specification',

        'product.attributes',
        'product.attributes.attribute', // 🔹 Ajouté
        'product.variations', // 🔹 Ajouté
        'product.variations.image',
        'product.variations.attributeValues',
        'product.variations.attributeValues.attribute',
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
    // const searchKey = keyword ? `%${keyword}%` : '%';
    if (!keyword || keyword.trim() === '') {
      return {
        data: {
          [CompanyType.RESTAURANT]: [],
          [CompanyType.GROCERY]: [],
          [CompanyType.SHOP]: [],
          [CompanyType.SERVICE]: [],
          PRODUCT: [],
          SERVICE_LIST: [],
        },
      };
    }

    const searchKey = `%${keyword}%`;

    // 1️⃣ Recherche des entreprises
    const companyQuery = this.companyRepo
      .createQueryBuilder('company')
      .leftJoinAndSelect('company.userHasCompany', 'userHasCompany')
      .leftJoinAndSelect('company.products', 'products')
      .leftJoinAndSelect('products.brand', 'brand') // ✅ Correctement lié ici
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

    // 2️⃣ Recherche des produits
    const productQuery = this.productRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.company', 'company')
      .leftJoinAndSelect('company.tauxCompanies', 'tauxCompanies')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('company.city', 'city')
      .leftJoinAndSelect('product.images', 'images')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('category.parent', 'parentCategory')
      .leftJoinAndSelect('product.brand', 'brand')
      .leftJoinAndSelect('product.measure', 'measure')
      .leftJoinAndSelect('product.specificationValues', 'specificationValues')
      .leftJoinAndSelect('specificationValues.specification', 'specification')
      .leftJoinAndSelect('product.attributes', 'attributes')
      .leftJoinAndSelect('attributes.attribute', 'attribute')
      .leftJoinAndSelect('product.variations', 'variations')
      .leftJoinAndSelect('variations.image', 'variationImage')
      .leftJoinAndSelect('variations.attributeValues', 'variationAttributeValues')
      .leftJoinAndSelect('variationAttributeValues.attribute', 'variationAttribute')
      .where(
        `
        (product.name LIKE :searchKey
        OR product.description LIKE :searchKey
        OR category.name LIKE :searchKey
        OR parentCategory.name LIKE :searchKey
        OR brand.name LIKE :searchKey)
        AND product.status = :status
      `,
        { searchKey, status: ProductStatus.PUBLISHED },
      );

    if (type) {
      productQuery.andWhere('company.typeCompany = :type', { type });
    }

    const products = await productQuery.orderBy('product.createdAt', 'DESC').getMany();

    // 3️⃣ Recherche des services
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

    // 4️⃣ Structure finale
    const groupedResults: Record<string, any> = {
      [CompanyType.RESTAURANT]: [],
      [CompanyType.GROCERY]: [],
      [CompanyType.SHOP]: [],
      [CompanyType.SERVICE]: [],
      PRODUCT: [],
      SERVICE_LIST: [],
    };

    // 5️⃣ Grouper les entreprises par type
    for (const company of companies) {
      if (groupedResults[company.typeCompany]) {
        groupedResults[company.typeCompany].push(company);
      }
    }

    // 6️⃣ Ajouter les produits dans PRODUCT
    for (const prod of products) {
      if (prod.company?.typeCompany === CompanyType.SHOP) {
        groupedResults.PRODUCT.push(prod);
      }
    }

    // 7️⃣ Ajouter les services dans SERVICE_LIST
    for (const serv of services) {
      groupedResults.SERVICE_LIST.push(serv);
    }

    // 8️⃣ Retour final
    return {
      message:
        companies.length === 0 && products.length === 0 && services.length === 0
          ? 'Aucun résultat trouvé.'
          : 'Résultats de la recherche récupérés avec succès.',
      data: groupedResults,
    };
  }

  async createBrand(
    createBrandDto: CreateBrandDto,
    file: Express.Multer.File,
  ): Promise<{ message: string; data?: Brand }> {
    const { name, type, status } = createBrandDto;

    if (!file) {
      throw new BadRequestException('Une image est requise pour créer une marque.');
    }

    // Vérifie doublon par name
    const existingBrand = await this.brandRepository.findOne({ where: { name } });
    if (existingBrand) {
      return {
        message: `La marque "${name}" existe déjà.`,
      };
    }

    // Générer le slug
    const slug = slugify(name, { lower: true, strict: true });

    // Upload image
    const imageUrl = await this.cloudinary.handleUploadImage(file, 'brand');

    // Création de la marque
    const brand = this.brandRepository.create({
      name,
      type,
      status: status ?? true,
      image: imageUrl,
      slug,
    });

    const savedBrand = await this.brandRepository.save(brand);

    return {
      message: 'Marque créée avec succès',
      data: savedBrand,
    };
  }

  //  Modifier une marque
  async updateBrand(
    id: string,
    updateBrandDto: UpdateBrandDto,
    file?: Express.Multer.File,
  ): Promise<{ message: string; data: Brand }> {
    // Vérifie si la marque existe
    const brand = await this.brandRepository.findOne({ where: { id } });
    if (!brand) {
      throw new NotFoundException(`Marque avec ID ${id} introuvable`);
    }

    // Si un fichier image est fourni, upload sur Cloudinary et met à jour l'url
    if (file) {
      const imageUrl = await this.cloudinary.handleUploadImage(file, 'brand');
      updateBrandDto.image = imageUrl; // ⚡ mappe sur le champ url
    }

    // Vérifie l'unicité du nom si on le modifie
    if (updateBrandDto.name && updateBrandDto.name !== brand.name) {
      const existingBrand = await this.brandRepository.findOne({
        where: { name: updateBrandDto.name },
      });
      if (existingBrand && existingBrand.id !== id) {
        throw new ConflictException('Une marque avec ce nom existe déjà');
      }
    }

    // Applique les mises à jour
    Object.assign(brand, updateBrandDto);

    // Sauvegarde
    const updatedBrand = await this.brandRepository.save(brand);

    return {
      message: 'Marque mise à jour avec succès',
      data: updatedBrand,
    };
  }

  // 🟢 Récupérer toutes les marques
  async findAllBrand(type?: string): Promise<{ message: string; data: Brand[] }> {
    const whereCondition = type ? { type } : {};

    const brands = await this.brandRepository.find({
      where: whereCondition,
      order: { createdAt: 'DESC' },
    });

    return {
      message: 'Liste des marques récupérée avec succès',
      data: brands,
    };
  }

  // 🟢 Récupérer une seule marque par ID
  async findOneBrand(id: string): Promise<{ message: string; data: Brand }> {
    const brand = await this.brandRepository.findOne({ where: { id } });
    if (!brand) {
      throw new NotFoundException(`Marque avec ID ${id} introuvable`);
    }

    return {
      message: 'Marque récupérée avec succès',
      data: brand,
    };
  }

  async deleteFromCloudinary(fileUrls: string | string[]): Promise<{ message: string }> {
    if (!fileUrls || (Array.isArray(fileUrls) && fileUrls.length === 0)) {
      throw new BadRequestException('Au moins un fichier est requis.');
    }

    const filesToDelete = Array.isArray(fileUrls) ? fileUrls : [fileUrls];

    // 1️⃣ Trouver les produits utilisant ces images comme principale
    const products = await this.productRepo.find({
      where: filesToDelete.map((url) => ({ image: url })),
    });

    // 2️⃣ Trouver les entités ImageProductEntity correspondantes
    const images = await this.imageRepository.find({
      where: filesToDelete.map((url) => ({ url })),
    });

    // 3️⃣ Vérification si l’URL existe quelque part
    if (products.length === 0 && images.length === 0) {
      return {
        message: 'Aucune image trouvée pour cette URL. Suppression ignorée.',
      };
    }

    // 4️⃣ Vérifier si une image est utilisée comme image principale d’un produit
    if (products.length > 0) {
      const productNames = products.map((p) => p.name || p.id).join(', ');
      throw new BadRequestException(
        `Impossible de supprimer l’image : elle est utilisée comme image principale pour le(s) produit(s) suivant(s) : ${productNames}`,
      );
    }

    // 5️⃣ Supprimer dans Cloudinary et dans la table ImageProductEntity
    for (const img of images) {
      try {
        await this.cloudinary.handleDeleteFile(img.url); // Supprimer du Cloudinary
        await this.imageRepository.remove(img); // Supprimer de la DB
      } catch (error) {
        throw new BadRequestException(
          `Erreur lors de la suppression de ${img.url} : ${error.message}`,
        );
      }
    }

    // 6️⃣ Confirmation
    return {
      message:
        filesToDelete.length > 1
          ? 'Toutes les images secondaires ont été supprimées avec succès.'
          : 'Image secondaire supprimée avec succès.',
    };
  }

  async updateProductImage(productId: string, imageUrl: string): Promise<Product> {
    const product = await this.productRepo.findOne({ where: { id: productId } });
    if (!product) {
      throw new NotFoundException('Produit non trouvé');
    }

    // 1️⃣ Vérifier si une autre image est déjà utilisée
    if (product.image === imageUrl) {
      return product; // rien à changer
    }

    // 2️⃣ Mettre à jour simplement l’image principale du produit sans supprimer ni nullifier
    await this.productRepo
      .createQueryBuilder()
      .update(Product)
      .set({ image: imageUrl })
      .where('id = :id', { id: product.id })
      .execute();

    // 3️⃣ Retourner le produit mis à jour
    const updatedProduct = await this.productRepo.findOne({ where: { id: product.id } });
    if (!updatedProduct) {
      throw new NotFoundException('Produit introuvable après mise à jour');
    }

    return updatedProduct;
  }
}
