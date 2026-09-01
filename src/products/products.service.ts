/* eslint-disable prefer-const */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, EntityManager, Repository } from 'typeorm';
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
import { PaginatedResponseDto } from './dto/paginated-response.dto';
import { FilesService } from 'src/files/files.service';
import { PermissionHelper } from 'src/users/utility/helpers/permission.helper';
import { I18nService } from 'src/libs/common/src';

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
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(UserPlatformRoleEntity)
    private readonly userPlatformRoleRepo: Repository<UserPlatformRoleEntity>,
    private readonly notificationsService: NotificationsService,
    @InjectRepository(Specification)
    private specRepo: Repository<Specification>,
    @InjectRepository(Brand)
    private readonly brandRepository: Repository<Brand>,
    private readonly filesService: FilesService,
    private readonly permissionHelper: PermissionHelper,
    private readonly i18n: I18nService,
  ) { }

  private readonly logger = new Logger(ProductService.name);
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Supprime les accents
      .replace(/[^a-z0-9\s-]/g, '') // Supprime les caractères spéciaux
      .replace(/\s+/g, '-') // Remplace les espaces par des tirets
      .replace(/-+/g, '-') // Supprime les tirets multiples
      .replace(/^-+|-+$/g, ''); // Supprime les tirets au début et à la fin
  }

  /**
   * Génère un slug unique en vérifiant s'il existe déjà
   */
  private async generateUniqueSlug(
    baseSlug: string,
    productId: string | null,
    manager?: EntityManager,
  ): Promise<string> {
    let slug = baseSlug;
    let counter = 1;
    let exists = true;

    const repo = manager ? manager.getRepository(Product) : this.productRepo;

    while (exists) {
      const existingProduct = await repo.findOne({
        where: { slug },
      });

      if (!existingProduct || existingProduct.id === productId) {
        exists = false;
      } else {
        slug = `${baseSlug}-${counter}`;
        counter++;
      }
    }

    return slug;
  }

  async create(
    createProductDto: CreateProductDto,
    files: Express.Multer.File[],
    user: UserWithCompanyStatus,
    lang: string = 'fr',
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
      throw new BadRequestException(
        await this.i18n.translate('image_count_invalid', lang),
      );
    }

    if (!user.activeCompanyId) {
      throw new BadRequestException(
        await this.i18n.translate('no_active_company', lang),
      );
    }

    const company = await this.companyRepo.findOne({
      where: { id: user.activeCompanyId },
    });
    if (!company) throw new NotFoundException(await this.i18n.translate('company_not_found', lang));

    let category: CategoryEntity | null = null;
    if (categoryId) {
      category = await this.categoryRepo.findOne({ where: { id: categoryId } });
      if (!category) throw new NotFoundException(await this.i18n.translate('category_not_found', lang));
    }

    let brand: Brand | null = null;
    if (brandId) {
      brand = await this.brandRepository.findOne({ where: { id: brandId } });
      if (!brand) throw new NotFoundException(await this.i18n.translate('brand_not_found', lang));
    }

    let measure: MeasureEntity | null = null;
    if (measureId) {
      measure = await this.measureRepo.findOne({ where: { id: measureId } });
      if (!measure) throw new NotFoundException(await this.i18n.translate('measure_not_found', lang));
    }

    if (
      (company.companyActivity === CompanyActivity.WHOLESALER ||
        company.companyActivity === CompanyActivity.WHOLESALER_RETAILER) &&
      (min_quantity === undefined || min_quantity === null)
    ) {
      throw new BadRequestException(
        await this.i18n.translate('min_quantity_required', lang),
      );
    }

    const productStatus = status || ProductStatus.PENDING;

    return await this.dataSource.transaction(async (manager) => {
      // 🔥 Générer le slug à partir du nom
      const baseSlug = this.generateSlug(data.name);
      const uniqueSlug = await this.generateUniqueSlug(baseSlug, null, manager);

      const product = manager.create(Product, {
        ...data,
        slug: uniqueSlug, // 🔥 Ajout du slug
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
        const uploadedFile = await this.filesService.uploadFile(
          file,
          'product',
          'product',
        );
        uploadedImages.push(uploadedFile.data);
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

      if (imageEntities.length > 0) {
        savedProduct.image = imageEntities[0].url;
        await manager.save(savedProduct);
      }

      if (specifications && Array.isArray(specifications)) {
        for (const spec of specifications) {
          const specification = await manager.findOne(Specification, {
            where: { id: spec.specificationId },
          });
          if (!specification) {
            throw new BadRequestException(
              await this.i18n.translate('specification_not_found', lang, { id: spec.specificationId }),
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

      if (attributes && Array.isArray(attributes)) {
        for (const attributeId of attributes) {
          const attribute = await manager.findOne(Attribute, {
            where: { id: attributeId },
          });
          if (!attribute) {
            throw new BadRequestException(
              await this.i18n.translate('attribute_not_found', lang, { id: attributeId }),
            );
          }

          const productAttribute = manager.create(ProductAttribute, {
            product: savedProduct,
            attribute,
          });
          await manager.save(productAttribute);
        }
      }

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
            throw new ConflictException(
              await this.i18n.translate('variation_sku_exists', lang, { sku }),
            );
          }

          let variationImage: ImageProductEntity | undefined;
          if (imageId) {
            const foundImage = await manager.findOne(ImageProductEntity, {
              where: { id: parseInt(imageId, 10) },
            });
            if (!foundImage) {
              throw new NotFoundException(
                await this.i18n.translate('image_not_found', lang, { id: imageId }),
              );
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
        throw new NotFoundException(await this.i18n.translate('product_not_found', lang));
      }

      finalProduct.images = imageEntities;

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
        this.logger.log(`RoomAvailability généré pour ${daysToGenerate} jours pour le produit hôtel : ${finalProduct.name}`);
      }

      const platformUsers = await this.userPlatformRoleRepo.find({
        where: { platform: { key: savedProduct.type } },
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
          await this.i18n.translate('new_product_notification_title', lang),
          await this.i18n.translate('new_product_notification_body', lang, {
            productName: savedProduct.name ?? savedProduct.id,
          }),
          'COMPANY' as any,
          savedProduct,
        );
      }

      this.logger.log(`Produit "${finalProduct.name}" créé avec succès.`);

      return {
        message: await this.i18n.translate('product_created', lang),
        data: finalProduct,
      };
    });
  }

  async update(
    id: string,
    dto: CreateProductDto,
    user: UserEntity,
    files?: Express.Multer.File[],
    lang: string = 'fr',
  ): Promise<{ message: string; data: Product }> {
    const {
      categoryId,
      brandId,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      status,
      measureId,
      specifications,
      attributes,
      variations,
      ...data
    } = dto;

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
      throw new NotFoundException(await this.i18n.translate('product_not_found', lang));
    }

    return await this.dataSource.transaction(async (manager) => {
      try {
        Object.assign(product, data);

        if (categoryId) {
          const category = await manager.findOne(CategoryEntity, {
            where: { id: categoryId },
          });
          if (!category) throw new NotFoundException(await this.i18n.translate('category_not_found', lang));
          product.category = category;
        } else {
          product.category = undefined;
        }

        if (brandId) {
          const brand = await manager.findOne(Brand, {
            where: { id: brandId },
          });
          if (!brand) throw new NotFoundException(await this.i18n.translate('brand_not_found', lang));
          product.brand = brand;
        } else {
          product.brand = undefined;
        }

        if (measureId) {
          const measure = await manager.findOne(MeasureEntity, {
            where: { id: measureId },
          });
          if (!measure) throw new NotFoundException(await this.i18n.translate('measure_not_found', lang));
          product.measure = measure;
        } else {
          product.measure = undefined;
        }

        if (files && files.length > 0) {
          const newImages: ImageProductEntity[] = [];
          for (const file of files) {
            const uploadedFile = await this.filesService.uploadFile(
              file,
              'product',
              'product',
            );
            const url = uploadedFile.data;
            const img = manager.create(ImageProductEntity, { url, product });
            const savedImg = await manager.save(img);
            newImages.push(savedImg);
          }
          product.images = [...(product.images || []), ...newImages];
        }

        const updatedProduct = await manager.save(product);

        if (specifications !== undefined) {
          await manager.delete(ProductSpecificationValue, { product: { id } });

          if (Array.isArray(specifications) && specifications.length > 0) {
            const specValuesToSave: ProductSpecificationValue[] = [];

            for (const spec of specifications) {
              if (!spec.specificationId) {
                throw new BadRequestException(
                  await this.i18n.translate('specification_id_required', lang),
                );
              }

              const specExists = await manager.findOne(Specification, {
                where: { id: spec.specificationId },
              });
              if (!specExists) {
                throw new BadRequestException(
                  await this.i18n.translate('specification_not_found', lang, { id: spec.specificationId }),
                );
              }

              const specValue = manager.create(ProductSpecificationValue, {
                product: { id } as Product,
                specification: specExists,
                value: spec.value || undefined,
              });
              specValuesToSave.push(specValue);
            }

            await manager.save(ProductSpecificationValue, specValuesToSave);
          }
        }

        if (attributes && Array.isArray(attributes)) {
          await manager.delete(ProductAttribute, { product: { id } });

          for (const attributeId of attributes) {
            const attribute = await manager.findOne(Attribute, {
              where: { id: attributeId },
            });
            if (!attribute) {
              throw new BadRequestException(
                await this.i18n.translate('attribute_not_found', lang, { id: attributeId }),
              );
            }

            const productAttribute = manager.create(ProductAttribute, {
              product: updatedProduct,
              attribute,
            });
            await manager.save(productAttribute);
          }
        }

        if (variations && Array.isArray(variations)) {
          await manager.delete(ProductVariation, { product: { id } });

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
              throw new ConflictException(
                await this.i18n.translate('variation_sku_exists', lang, { sku }),
              );
            }

            let variationImage: ImageProductEntity | undefined = undefined;
            if (imageId) {
              const imageIdNumber = parseInt(imageId, 10);
              if (isNaN(imageIdNumber)) {
                throw new BadRequestException(
                  await this.i18n.translate('invalid_image_id', lang, { id: imageId }),
                );
              }

              const foundImage = await manager.findOne(ImageProductEntity, {
                where: { id: imageIdNumber },
              });
              if (!foundImage) {
                throw new NotFoundException(
                  await this.i18n.translate('image_not_found', lang, { id: imageId }),
                );
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
              product: updatedProduct,
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
          message: await this.i18n.translate('product_updated', lang),
          data: productWithRelations!,
        };
      } catch (error) {
        this.logger.error(
          `Erreur lors de la mise à jour du produit: ${error.message}`,
        );
        throw error;
      }
    });
  }

  async createProduct(
    createProductAdminDto: CreateProductAdminDto,
    files: Express.Multer.File[],
    user: UserEntity,
    lang: string = 'fr',
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

    if (!files || files.length < 1 || files.length > 30) {
      throw new BadRequestException(await this.i18n.translate('image_count_invalid', lang));
    }

    let targetCompanyId: string;
    let targetCompany: CompanyEntity | null = null;

    if (companyId) {
      targetCompany = await this.companyRepo.findOne({
        where: { id: companyId },
      });
      if (!targetCompany)
        throw new NotFoundException(await this.i18n.translate('company_not_found', lang));
      targetCompanyId = companyId;
    } else {
      if (!user.activeCompanyId) {
        throw new BadRequestException(await this.i18n.translate('no_active_company', lang));
      }
      targetCompany = await this.companyRepo.findOne({
        where: { id: user.activeCompanyId },
      });
      if (!targetCompany)
        throw new NotFoundException(await this.i18n.translate('company_not_found', lang));
      targetCompanyId = user.activeCompanyId;
    }

    const requiredResource = this.permissionHelper.getResourceByCompanyType(
      targetCompany.typeCompany,
    );

    const hasManage = await this.permissionHelper.hasManageOnResource(
      user,
      requiredResource,
    );

    let finalCompanyId: string;

    if (hasManage) {
      if (!companyId) {
        throw new BadRequestException(
          await this.i18n.translate('company_id_required_for_manage', lang, { resource: requiredResource }),
        );
      }
      finalCompanyId = companyId;
    } else {
      if (companyId && companyId !== user.activeCompanyId) {
        throw new ForbiddenException(
          await this.i18n.translate('create_product_forbidden', lang, { resource: requiredResource }),
        );
      }
      if (!user.activeCompanyId) {
        throw new BadRequestException(await this.i18n.translate('no_active_company', lang));
      }
      finalCompanyId = user.activeCompanyId;
    }

    const company = await this.companyRepo.findOne({
      where: { id: finalCompanyId },
    });
    if (!company) throw new NotFoundException(await this.i18n.translate('company_not_found', lang));

    const hasCreatePermission = await this.permissionHelper.hasPermissionOnResource(
      user,
      requiredResource,
      'canCreate',
    );

    if (!hasCreatePermission) {
      throw new ForbiddenException(
        await this.i18n.translate('no_permission_create_product', lang, {
          type: company.typeCompany,
          resource: requiredResource,
        }),
      );
    }

    let category: CategoryEntity | null = null;
    if (categoryId) {
      category = await this.categoryRepo.findOne({ where: { id: categoryId } });
      if (!category) throw new NotFoundException(await this.i18n.translate('category_not_found', lang));
    }

    let brand: Brand | null = null;
    if (brandId) {
      brand = await this.brandRepository.findOne({ where: { id: brandId } });
      if (!brand) throw new NotFoundException(await this.i18n.translate('brand_not_found', lang));
    }

    let measure: MeasureEntity | null = null;
    if (measureId) {
      measure = await this.measureRepo.findOne({ where: { id: measureId } });
      if (!measure) throw new NotFoundException(await this.i18n.translate('measure_not_found', lang));
    }

    if (
      (company.companyActivity === CompanyActivity.WHOLESALER ||
        company.companyActivity === CompanyActivity.WHOLESALER_RETAILER) &&
      (min_quantity === undefined || min_quantity === null)
    ) {
      throw new BadRequestException(
        await this.i18n.translate('min_quantity_required', lang),
      );
    }

    const productStatus = status || ProductStatus.PENDING;

    return await this.dataSource.transaction(async (manager) => {
      // 🔥 Générer le slug à partir du nom
      const baseSlug = this.generateSlug(data.name);
      const uniqueSlug = await this.generateUniqueSlug(baseSlug, null, manager);

      const product = manager.create(Product, {
        ...data,
        slug: uniqueSlug, // 🔥 Ajout du slug
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
        const uploadResult = await this.filesService.uploadFile(
          file,
          'product',
          'product',
        );
        uploadedImages.push(uploadResult.data);
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

      if (imageEntities.length > 0) {
        savedProduct.image = imageEntities[0].url;
        await manager.save(savedProduct);
      }

      if (specifications && Array.isArray(specifications)) {
        for (const spec of specifications) {
          const specification = await manager.findOne(Specification, {
            where: { id: spec.specificationId },
          });
          if (!specification) {
            throw new BadRequestException(
              await this.i18n.translate('specification_not_found', lang, { id: spec.specificationId }),
            );
          }
          const formattedValue = convertSpecValue(
            specification.type,
            spec.value,
          );
          const specValue = manager.create(ProductSpecificationValue, {
            product: savedProduct,
            specification,
            value: formattedValue,
          });
          await manager.save(specValue);
        }
      }

      if (attributes && Array.isArray(attributes)) {
        for (const attributeId of attributes) {
          const attribute = await manager.findOne(Attribute, {
            where: { id: attributeId },
          });
          if (!attribute) {
            throw new BadRequestException(
              await this.i18n.translate('attribute_not_found', lang, { id: attributeId }),
            );
          }
          const productAttribute = manager.create(ProductAttribute, {
            product: savedProduct,
            attribute,
          });
          await manager.save(productAttribute);
        }
      }

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
            throw new ConflictException(
              await this.i18n.translate('variation_sku_exists', lang, { sku }),
            );
          }

          let variationImage: ImageProductEntity | undefined;
          if (imageId) {
            const imageIdNumber = parseInt(imageId, 10);
            if (isNaN(imageIdNumber)) {
              throw new BadRequestException(
                await this.i18n.translate('invalid_image_id', lang, { id: imageId }),
              );
            }
            const foundImage = await manager.findOne(ImageProductEntity, {
              where: { id: imageIdNumber },
            });
            if (!foundImage) {
              throw new NotFoundException(
                await this.i18n.translate('image_not_found', lang, { id: imageId }),
              );
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
        throw new NotFoundException(await this.i18n.translate('product_not_found', lang));
      }

      finalProduct.images = imageEntities;

      this.logger.log(`Produit "${finalProduct.name}" créé avec succès. Slug: ${finalProduct.slug}`);

      return {
        message: await this.i18n.translate('product_created', lang),
        data: finalProduct,
      };
    });
  }

  async updateProduct(
    id: string,
    dto: CreateProductAdminDto,
    files: Express.Multer.File[] | undefined,
    currentUser: UserEntity,
    lang: string = 'fr',
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
    if (!product) throw new NotFoundException(await this.i18n.translate('product_not_found', lang));

    const hasManage = await this.permissionHelper.hasManageOnResource(
      currentUser,
      'PRODUCTS',
    );

    if (!hasManage) {
      if (!currentUser.activeCompanyId) {
        throw new BadRequestException(await this.i18n.translate('no_active_company', lang));
      }
      if (product.company?.id !== currentUser.activeCompanyId) {
        throw new ForbiddenException(await this.i18n.translate('update_product_forbidden', lang));
      }
      if (companyId && companyId !== currentUser.activeCompanyId) {
        throw new ForbiddenException(await this.i18n.translate('cannot_change_company', lang));
      }
    } else {
      if (companyId && (!product.company || product.company.id !== companyId)) {
        const newCompany = await this.companyRepo.findOne({
          where: { id: companyId },
        });
        if (!newCompany)
          throw new NotFoundException(await this.i18n.translate('company_not_found', lang));
        product.company = newCompany;
      }
    }

    return await this.dataSource.transaction(async (manager) => {
      Object.assign(product, data);

      if (categoryId) {
        const category = await manager.findOne(CategoryEntity, {
          where: { id: categoryId },
        });
        if (!category) throw new NotFoundException(await this.i18n.translate('category_not_found', lang));
        product.category = category;
      } else {
        product.category = undefined;
      }

      if (brandId) {
        const brand = await manager.findOne(Brand, { where: { id: brandId } });
        if (!brand) throw new NotFoundException(await this.i18n.translate('brand_not_found', lang));
        product.brand = brand;
      } else {
        product.brand = undefined;
      }

      if (measureId) {
        const measure = await manager.findOne(MeasureEntity, {
          where: { id: measureId },
        });
        if (!measure) throw new NotFoundException(await this.i18n.translate('measure_not_found', lang));
        product.measure = measure;
      } else {
        product.measure = undefined;
      }

      if (files && files.length > 0) {
        const newImages: ImageProductEntity[] = [];
        for (const file of files) {
          const uploadResult = await this.filesService.uploadFile(
            file,
            'product',
            'product',
          );
          const imageEntity = manager.create(ImageProductEntity, {
            url: uploadResult.data,
            product: product,
          });
          const savedImage = await manager.save(imageEntity);
          newImages.push(savedImage);
        }
        product.images = [...(product.images || []), ...newImages];
      }

      const updatedProduct = await manager.save(product);

      if (specifications !== undefined) {
        await manager.delete(ProductSpecificationValue, { product: { id } });
        if (Array.isArray(specifications) && specifications.length > 0) {
          const specValuesToSave: ProductSpecificationValue[] = [];
          for (const spec of specifications) {
            if (!spec.specificationId) {
              throw new BadRequestException(
                await this.i18n.translate('specification_id_required', lang),
              );
            }
            const specExists = await manager.findOne(Specification, {
              where: { id: spec.specificationId },
            });
            if (!specExists) {
              throw new BadRequestException(
                await this.i18n.translate('specification_not_found', lang, { id: spec.specificationId }),
              );
            }
            const specValue = manager.create(ProductSpecificationValue, {
              product: updatedProduct,
              specification: specExists,
              value: spec.value || undefined,
            });
            specValuesToSave.push(specValue);
          }
          await manager.save(ProductSpecificationValue, specValuesToSave);
        }
      }

      if (attributes !== undefined) {
        await manager.delete(ProductAttribute, { product: { id } });
        if (Array.isArray(attributes) && attributes.length > 0) {
          for (const attributeId of attributes) {
            const attribute = await manager.findOne(Attribute, {
              where: { id: attributeId },
            });
            if (!attribute) {
              throw new BadRequestException(
                await this.i18n.translate('attribute_not_found', lang, { id: attributeId }),
              );
            }
            const productAttribute = manager.create(ProductAttribute, {
              product: updatedProduct,
              attribute,
            });
            await manager.save(productAttribute);
          }
        }
      }

      if (variations !== undefined) {
        await manager.delete(ProductVariation, { product: { id } });
        if (Array.isArray(variations) && variations.length > 0) {
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
              throw new ConflictException(
                await this.i18n.translate('variation_sku_exists', lang, { sku }),
              );
            }

            let variationImage: ImageProductEntity | undefined;
            if (imageId) {
              const imageIdNumber = parseInt(imageId, 10);
              if (isNaN(imageIdNumber)) {
                throw new BadRequestException(
                  await this.i18n.translate('invalid_image_id', lang, { id: imageId }),
                );
              }
              const foundImage = await manager.findOne(ImageProductEntity, {
                where: { id: imageIdNumber },
              });
              if (!foundImage) {
                throw new NotFoundException(
                  await this.i18n.translate('image_not_found', lang, { id: imageId }),
                );
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
              product: updatedProduct,
              image: variationImage,
            });
            const savedVariation = await manager.save(variation);

            if (Array.isArray(attributeValues) && attributeValues.length > 0) {
              const attrValueEntities = attributeValues.map((attrValue) =>
                manager.create(VariationAttributeValue, {
                  value: attrValue.value,
                  attribute: { id: attrValue.attributeId },
                  variation: savedVariation,
                }),
              );
              await manager.save(attrValueEntities);
            }
          }
        }
      }

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

      if (!productWithRelations) {
        throw new NotFoundException(await this.i18n.translate('product_not_found', lang));
      }

      return {
        message: await this.i18n.translate('product_updated', lang),
        data: productWithRelations,
      };
    });
  }

  async findOne(id: string, lang: string = 'fr'): Promise<{ message: string; data: Product }> {
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
      throw new NotFoundException(await this.i18n.translate('product_not_found', lang));
    }

    return {
      message: await this.i18n.translate('product_retrieved', lang),
      data: product,
    };
  }

  async findOneBySlug(
    slug: string,
    lang: string = 'fr',
  ): Promise<{ message: string; data: Product }> {
    const product = await this.productRepo.findOne({
      where: { slug },
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
      throw new NotFoundException(await this.i18n.translate('product_not_found', lang));
    }

    return {
      message: await this.i18n.translate('product_retrieved', lang),
      data: product,
    };
  }

  async findByType(
    currentUser: UserEntity,
    type?: string,
    search?: string,
    page: number = 1,
    limit: number = 10,
    lang: string = 'fr',
  ): Promise<{ message: string; data: PaginatedResponseDto<Product> }> {
    const activeCompany = await this.companyRepo.findOne({
      where: { id: currentUser.activeCompanyId },
    });

    if (!activeCompany) {
      throw new NotFoundException(await this.i18n.translate('company_not_found', lang));
    }

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
      .leftJoinAndSelect(
        'variations.attributeValues',
        'variationAttributeValues',
      )
      .leftJoinAndSelect(
        'variationAttributeValues.attribute',
        'variationAttribute',
      );

    if (!activeCompany.isMain) {
      queryBuilder.andWhere('product.companyId = :companyId', {
        companyId: currentUser.activeCompanyId,
      });
    }

    if (type) {
      queryBuilder.andWhere('product.type = :type', { type });
    }
    if (search && search.trim() !== '') {
      queryBuilder.andWhere('product.name LIKE :search', {
        search: `%${search}%`,
      });
    }

    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    // ✅ ORDRE ALEATOIRE - DONNE UNE CHANCE À TOUS LES PRODUITS (comme dans findProductPublishedByTypeByCompany)
    queryBuilder.orderBy('RAND()');

    const [products, total] = await queryBuilder.getManyAndCount();
    const paginatedData = new PaginatedResponseDto(
      products,
      total,
      page,
      limit,
    );

    return {
      message: await this.i18n.translate('products_retrieved', lang),
      data: paginatedData,
    };
  }

  async findProductPublishedByType(
    type?: string,
    lang: string = 'fr',
    filters?: {
      brandId?: string;
      shopType?: string;
      fuelType?: string;
      transmission?: string;
      typecar?: string;
      year?: string;
      yearStart?: number;
      yearEnd?: number;
      companyId?: string;
      minDailyRate?: number;
      maxDailyRate?: number;
      minSalePrice?: number;
      maxSalePrice?: number;
      cityId?: string;
      categoryId?: string;
      countryId?: string;
      page?: number;
      limit?: number;
      includeSpecifications?: boolean;
      includeVariations?: boolean;
    }
  ): Promise<{ message: string; data: Product[]; total?: number }> {
    const page = Math.max(filters?.page || 1, 1);
    const limit = Math.min(filters?.limit || 20, 100);
    const includeSpecs = filters?.includeSpecifications !== false;
    const includeVars = filters?.includeVariations !== false;

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
      .where('product.status = :status', { status: ProductStatus.PUBLISHED });

    if (includeSpecs) {
      queryBuilder
        .leftJoinAndSelect('product.specificationValues', 'specificationValues')
        .leftJoinAndSelect('specificationValues.specification', 'specification');
    }

    if (includeVars) {
      queryBuilder
        .leftJoinAndSelect('product.variations', 'variations')
        .leftJoinAndSelect('variations.image', 'variationImage')
        .leftJoinAndSelect(
          'variations.attributeValues',
          'variationAttributeValues',
        )
        .leftJoinAndSelect(
          'variationAttributeValues.attribute',
          'variationAttribute',
        );
    }

    if (type) {
      queryBuilder.andWhere('product.type = :type', { type });
    }

    if (filters) {
      if (filters.categoryId) {
        queryBuilder.andWhere(
          '(category.id = :categoryId OR categoryParent.id = :categoryId OR categoryChildren.id = :categoryId)',
          { categoryId: filters.categoryId },
        );
      }
      if (filters.brandId) {
        queryBuilder.andWhere('product.brand_id = :brandId', {
          brandId: filters.brandId
        });
      }
      if (filters.companyId) {
        queryBuilder.andWhere('product.companyId = :companyId', {
          companyId: filters.companyId
        });
      }
      if (filters.countryId) {
        queryBuilder.andWhere('company.countryId = :countryId', {
          countryId: filters.countryId
        });
      }
      if (filters.cityId) {
        queryBuilder.andWhere('company.cityId = :cityId', {
          cityId: filters.cityId
        });
      }
      if (filters.shopType?.trim()) {
        const activities: string[] = [];
        if (filters.shopType === CompanyActivity.WHOLESALER) {
          activities.push(
            CompanyActivity.WHOLESALER,
            CompanyActivity.WHOLESALER_RETAILER,
          );
        }
        if (filters.shopType === CompanyActivity.RETAILER) {
          activities.push(
            CompanyActivity.RETAILER,
            CompanyActivity.WHOLESALER_RETAILER,
          );
        }
        if (filters.shopType === CompanyActivity.WHOLESALER_RETAILER) {
          activities.push(
            CompanyActivity.WHOLESALER,
            CompanyActivity.RETAILER,
            CompanyActivity.WHOLESALER_RETAILER,
          );
        }
        queryBuilder.andWhere('product.companyActivity IN (:...activities)', {
          activities,
        });

        if (filters.shopType === CompanyActivity.WHOLESALER) {
          queryBuilder.andWhere('product.gros_price_original > 0');
        }
        if (filters.shopType === CompanyActivity.RETAILER) {
          queryBuilder.andWhere('product.detail_price_original > 0');
        }
        if (filters.shopType === CompanyActivity.WHOLESALER_RETAILER) {
          queryBuilder.andWhere(
            '(product.gros_price_original > 0 OR product.detail_price_original > 0)',
          );
        }
      }
      if (filters.fuelType) {
        queryBuilder.andWhere('product.fuelType = :fuelType', {
          fuelType: filters.fuelType
        });
      }
      if (filters.transmission) {
        queryBuilder.andWhere('product.transmission = :transmission', {
          transmission: filters.transmission,
        });
      }
      if (filters.year) {
        queryBuilder.andWhere('product.year = :year', {
          year: filters.year
        });
      }
      if (filters.yearStart !== undefined || filters.yearEnd !== undefined) {
        if (filters.yearStart !== undefined && filters.yearEnd !== undefined) {
          queryBuilder.andWhere(
            'CAST(product.year AS UNSIGNED) BETWEEN :yearStart AND :yearEnd',
            { yearStart: filters.yearStart, yearEnd: filters.yearEnd },
          );
        } else if (filters.yearStart !== undefined) {
          queryBuilder.andWhere('CAST(product.year AS UNSIGNED) >= :yearStart', {
            yearStart: filters.yearStart,
          });
        } else if (filters.yearEnd !== undefined) {
          queryBuilder.andWhere('CAST(product.year AS UNSIGNED) <= :yearEnd', {
            yearEnd: filters.yearEnd,
          });
        }
      }
      if (filters.typecar) {
        const saleTypes = [
          Type_rental_both_sale_car.SALE,
          Type_rental_both_sale_car.BOTH,
        ];
        const rentalTypes = [
          Type_rental_both_sale_car.RENTAL,
          Type_rental_both_sale_car.BOTH,
        ];

        if (saleTypes.includes(filters.typecar as Type_rental_both_sale_car)) {
          if (filters.minSalePrice !== undefined) {
            queryBuilder.andWhere('product.salePrice >= :minSalePrice', {
              minSalePrice: filters.minSalePrice,
            });
          }
          if (filters.maxSalePrice !== undefined) {
            queryBuilder.andWhere('product.salePrice <= :maxSalePrice', {
              maxSalePrice: filters.maxSalePrice,
            });
          }
        }
        if (rentalTypes.includes(filters.typecar as Type_rental_both_sale_car)) {
          if (filters.minDailyRate !== undefined) {
            queryBuilder.andWhere('product.dailyRate >= :minDailyRate', {
              minDailyRate: filters.minDailyRate,
            });
          }
          if (filters.maxDailyRate !== undefined) {
            queryBuilder.andWhere('product.dailyRate <= :maxDailyRate', {
              maxDailyRate: filters.maxDailyRate,
            });
          }
        }
        queryBuilder.andWhere('product.typecar = :typecar', {
          typecar: filters.typecar
        });
      }
    }

    // ✅ ORDRE ALEATOIRE - DONNE UNE CHANCE À TOUS LES PRODUITS
    queryBuilder
      .orderBy('RAND()')
      .skip((page - 1) * limit)
      .take(limit);

    const [products, total] = await queryBuilder.getManyAndCount();

    return {
      message: await this.i18n.translate('published_products_retrieved', lang),
      data: products,
      total,
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
    countryId?: string,
    cityId?: string,
    categoryId?: string,
    page = 1,
    limit = 10,
    lang: string = 'fr',
  ): Promise<{
    message: string;
    data: {
      data: any[];
      total: number;
      page: number;
      limit: number;
    };
  }> {
    const skip = (page - 1) * limit;

    const queryBuilder = this.productRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.company', 'company')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('company.city', 'city')
      .leftJoinAndSelect('company.tauxCompanies', 'tauxCompanies')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('category.parent', 'parent')
      .leftJoinAndSelect('product.images', 'images')
      .leftJoinAndSelect('product.measure', 'measure')
      .leftJoinAndSelect('product.brand', 'brand')
      .leftJoinAndSelect('product.specificationValues', 'specificationValues')
      .leftJoinAndSelect('specificationValues.specification', 'specification')
      .leftJoinAndSelect('product.attributes', 'attributes')
      .leftJoinAndSelect('product.variations', 'variations')
      .where('product.status = :productStatus', {
        productStatus: ProductStatus.PUBLISHED,
      })
      .andWhere('company.status = :companyStatus', {
        companyStatus: 'VALIDATED',
      });

    if (type) {
      queryBuilder.andWhere('company.typeCompany = :type', { type });
    }
    if (companyId) {
      queryBuilder.andWhere('company.id = :companyId', { companyId });
    }
    if (shopType) {
      queryBuilder.andWhere('company.companyActivity = :shopType', {
        shopType,
      });
    }
    if (countryId) {
      queryBuilder.andWhere('company.countryId = :countryId', { countryId });
    }
    if (cityId) {
      queryBuilder.andWhere('company.cityId = :cityId', { cityId });
    }
    if (categoryId) {
      queryBuilder.andWhere('product.categoryId = :categoryId', { categoryId });
    }

    if (fuelType) {
      queryBuilder.andWhere('product.fuelType = :fuelType', { fuelType });
    }
    if (transmission) {
      queryBuilder.andWhere('product.transmission = :transmission', {
        transmission,
      });
    }
    if (typecar) {
      queryBuilder.andWhere('product.typecar = :typecar', { typecar });
    }
    if (minDailyRate !== undefined) {
      queryBuilder.andWhere('product.dailyRate >= :minDailyRate', {
        minDailyRate,
      });
    }
    if (maxDailyRate !== undefined) {
      queryBuilder.andWhere('product.dailyRate <= :maxDailyRate', {
        maxDailyRate,
      });
    }
    if (minSalePrice !== undefined) {
      queryBuilder.andWhere('product.salePrice >= :minSalePrice', {
        minSalePrice,
      });
    }
    if (maxSalePrice !== undefined) {
      queryBuilder.andWhere('product.salePrice <= :maxSalePrice', {
        maxSalePrice,
      });
    }

    // ✅ ORDRE ALEATOIRE - DONNE UNE CHANCE À TOUS LES PRODUITS
    queryBuilder.orderBy('RAND()').skip(skip).take(limit);

    const [products, total] = await Promise.all([
      queryBuilder.getMany(),
      queryBuilder.getCount(),
    ]);

    if (products.length === 0) {
      return {
        message: await this.i18n.translate('no_products_found', lang),
        data: { data: [], total: 0, page, limit },
      };
    }

    const companyIds = [
      ...new Set(products.map((p) => p.company?.id).filter(Boolean)),
    ];

    let companyStatsMap = new Map();

    if (companyIds.length > 0) {
      const companyProductsStats = await this.productRepo
        .createQueryBuilder('p')
        .select([
          'p.companyId as companyId',
          'COUNT(p.id) as totalProduct',
          'COUNT(DISTINCT p.category_id) as totalCategory',
        ])
        .where('p.companyId IN (:...companyIds)', { companyIds })
        .andWhere('p.status = :status', { status: ProductStatus.PUBLISHED })
        .groupBy('p.companyId')
        .getRawMany();

      const orderStats = await this.orderItemRepo
        .createQueryBuilder('item')
        .innerJoin('item.product', 'product')
        .select([
          'product.companyId as companyId',
          'COUNT(DISTINCT item.orderId) as totalCommande',
        ])
        .where('product.companyId IN (:...companyIds)', { companyIds })
        .groupBy('product.companyId')
        .getRawMany();

      for (const cid of companyIds) {
        const productStat = companyProductsStats.find(
          (p) => p.companyId === cid,
        );
        const orderStat = orderStats.find((o) => o.companyId === cid);

        companyStatsMap.set(cid, {
          totalProduct: Number(productStat?.totalProduct || 0),
          totalCategory: Number(productStat?.totalCategory || 0),
          totalCommande: Number(orderStat?.totalCommande || 0),
        });
      }
    }

    let companyProductsCache = new Map();

    for (const cid of companyIds) {
      if (companyStatsMap.get(cid)?.totalProduct > 0) {
        const fullCompanyProducts = await this.productRepo.find({
          where: { company: { id: cid }, status: ProductStatus.PUBLISHED },
          relations: ['category'],
          take: 100,
        });
        companyProductsCache.set(cid, fullCompanyProducts);
      } else {
        companyProductsCache.set(cid, []);
      }
    }

    const formattedProducts: any[] = [];

    for (const product of products) {
      const companyId = product.company?.id;
      const stats = companyStatsMap.get(companyId) || {
        totalProduct: 0,
        totalCategory: 0,
        totalCommande: 0,
      };

      const companyProductsForStats = companyProductsCache.get(companyId) || [];

      const catMap = new Map();
      companyProductsForStats.forEach((p) => {
        if (p.category) catMap.set(p.category.id, p.category);
      });
      const categoriesForStats = Array.from(catMap.values());

      if (product.company?.userHasCompany) {
        product.company.userHasCompany.forEach((uhc) => {
          if (uhc.user && (uhc.user as any).password) {
            delete (uhc.user as any).password;
          }
        });
      }

      const formattedProduct: any = {
        id: product.id,
        name: product.name || '',
        description: product.description || '',
        price: product.price,
        detail_price_original: product.detail_price_original,
        gros_price_original: product.gros_price_original,
        detail: product.detail,
        gros: product.gros,
        type: product.type,
        registrationNumber: product.registrationNumber,
        model: product.model,
        year: product.year,
        typecar: product.typecar,
        dailyRate: product.dailyRate,
        salePrice: product.salePrice,
        fuelType: product.fuelType,
        transmission: product.transmission,
        color: product.color,
        dailyRate_price_original: product.dailyRate_price_original,
        ingredients: product.ingredients,
        quantity: product.quantity,
        min_quantity: product.min_quantity,
        stockAlert: product.stockAlert,
        image: product.image,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
        status: product.status,
        companyActivity: product.companyActivity,
        localization: product.localization,
        capacityAdults: product.capacityAdults,
        capacityChildren: product.capacityChildren,
        capacityTotal: product.capacityTotal,
        bedTypes: product.bedTypes,
        category: product.category
          ? {
            id: product.category.id,
            name: product.category.name,
            image: product.category.image,
            slug: product.category.slug,
            type: product.category.type,
            color: product.category.color,
            status: product.category.status,
            deleted: product.category.deleted,
            createdAt: product.category.createdAt,
            updatedAt: product.category.updatedAt,
            parent: product.category.parent
              ? {
                id: product.category.parent.id,
                name: product.category.parent.name,
                image: product.category.parent.image,
                slug: product.category.parent.slug,
                type: product.category.parent.type,
                color: product.category.parent.color,
                status: product.category.parent.status,
                deleted: product.category.parent.deleted,
                createdAt: product.category.parent.createdAt,
                updatedAt: product.category.parent.updatedAt,
              }
              : null,
            children: [],
          }
          : null,
        images:
          product.images?.map((img) => ({
            id: img.id,
            url: img.url,
          })) || [],
        measure: product.measure
          ? {
            id: product.measure.id,
            name: product.measure.name,
            abbreviation: product.measure.abbreviation,
          }
          : null,
        company: product.company
          ? {
            id: product.company.id,
            companyName: product.company.companyName,
            companyAddress: product.company.companyAddress,
            vatNumber: product.company.vatNumber,
            registrationDocumentUrl: product.company.registrationDocumentUrl,
            warehouseLocation: product.company.warehouseLocation,
            banner: product.company.banner,
            logo: product.company.logo,
            status: product.company.status,
            typeCompany: product.company.typeCompany,
            email: product.company.email,
            phone: product.company.phone,
            website: product.company.website,
            companyActivity: product.company.companyActivity,
            delivery_minutes: product.company.delivery_minutes,
            distance_km: product.company.distance_km,
            open_time: product.company.open_time,
            address: product.company.address,
            latitude: product.company.latitude,
            longitude: product.company.longitude,
            taux: product.company.taux,
            localCurrency: product.company.localCurrency,
            countryId: product.company.countryId,
            categoryId: product.company.categoryId,
            cityId: product.company.cityId,
            createdAt: product.company.createdAt,
            country: product.company.country
              ? {
                id: product.company.country.id,
                name: product.company.country.name,
                code: product.company.country.code,
                status: product.company.country.status,
                createdAt: product.company.country.createdAt,
                updatedAt: product.company.country.updatedAt,
              }
              : null,
            city: product.company.city
              ? {
                id: product.company.city.id,
                name: product.company.city.name,
                countryId: product.company.city.countryId,
                status: product.company.city.status,
                createdAt: product.company.city.createdAt,
                updatedAt: product.company.city.updatedAt,
              }
              : null,
            tauxCompanies:
              product.company.tauxCompanies?.map((taux) => ({
                id: taux.id,
                name: taux.name,
                value: taux.value,
                currency: taux.currency,
                isActive: taux.isActive,
                companyId: taux.companyId,
                createdAt: taux.createdAt,
                updatedAt: taux.updatedAt,
              })) || [],
            start: {
              totalProduct: stats.totalProduct,
              totalCategory: stats.totalCategory,
              totalCommande: stats.totalCommande,
            },
            products: companyProductsForStats,
            categories: categoriesForStats,
          }
          : null,
        brand: product.brand,
        specificationValues:
          product.specificationValues?.map((sv) => ({
            id: sv.id,
            value: sv.value,
            specification: sv.specification
              ? {
                id: sv.specification.id,
                label: sv.specification.label,
              }
              : null,
          })) || [],
        attributes: product.attributes || [],
        variations: product.variations || [],
      };

      formattedProducts.push(formattedProduct);
    }

    // ✅ Tri par popularité pour les produits ayant le même score, puis aléatoire
    formattedProducts.sort((a, b) => {
      const commandesA = a.company?.start?.totalCommande || 0;
      const commandesB = b.company?.start?.totalCommande || 0;
      return commandesB - commandesA;
    });

    let message = await this.i18n.translate('published_products_retrieved', lang);
    const filters: string[] = [];

    if (type) filters.push(`type: ${type}`);
    if (fuelType) filters.push(`carburant: ${fuelType}`);
    if (transmission) filters.push(`transmission: ${transmission}`);
    if (typecar) filters.push(`type véhicule: ${typecar}`);
    if (shopType) filters.push(`type boutique: ${shopType}`);

    if (filters.length > 0 && total > 0) {
      message += ` avec filtres: ${filters.join(', ')}`;
    }
    if (total === 0) {
      message = await this.i18n.translate('no_products_found', lang);
      if (filters.length > 0) {
        message += ` avec les filtres: ${filters.join(', ')}`;
      }
    }

    return {
      message,
      data: {
        data: formattedProducts,
        total,
        page,
        limit,
      },
    };
  }

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
    cityId?: string,
    page = 1,
    limit = 10,
    lang: string = 'fr',
  ): Promise<{
    message: string;
    data: { data: any[]; total: number; page: number; limit: number };
  }> {
    const skip = (page - 1) * limit;

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
      .leftJoinAndSelect(
        'variations.attributeValues',
        'variationAttributeValues',
      )
      .leftJoinAndSelect(
        'variationAttributeValues.attribute',
        'variationAttribute',
      )
      .where('product.status = :status', { status: ProductStatus.PUBLISHED });

    if (brandId) {
      queryBuilder.andWhere('product.brand_id = :brandId', { brandId });
    }

    if (companyId) {
      queryBuilder.andWhere('product.companyId = :companyId', { companyId });
    }

    if (categoryId) {
      queryBuilder.andWhere(
        '(category.id = :categoryId OR categoryParent.id = :categoryId OR categoryChildren.id = :categoryId)',
        { categoryId },
      );
    }

    if (type) {
      queryBuilder.andWhere('product.type = :type', { type });
    }

    if (shopType?.trim()) {
      const activities: string[] = [];
      if (shopType === CompanyActivity.WHOLESALER) {
        activities.push(
          CompanyActivity.WHOLESALER,
          CompanyActivity.WHOLESALER_RETAILER,
        );
      }
      if (shopType === CompanyActivity.RETAILER) {
        activities.push(
          CompanyActivity.RETAILER,
          CompanyActivity.WHOLESALER_RETAILER,
        );
      }
      if (shopType === CompanyActivity.WHOLESALER_RETAILER) {
        activities.push(
          CompanyActivity.WHOLESALER,
          CompanyActivity.RETAILER,
          CompanyActivity.WHOLESALER_RETAILER,
        );
      }
      queryBuilder.andWhere('product.companyActivity IN (:...activities)', {
        activities,
      });

      if (shopType === CompanyActivity.WHOLESALER) {
        queryBuilder.andWhere('product.gros_price_original > 0');
      }
      if (shopType === CompanyActivity.RETAILER) {
        queryBuilder.andWhere('product.detail_price_original > 0');
      }
      if (shopType === CompanyActivity.WHOLESALER_RETAILER) {
        queryBuilder.andWhere(
          '(product.gros_price_original > 0 OR product.detail_price_original > 0)',
        );
      }
    }

    if (fuelType) {
      queryBuilder.andWhere('product.fuelType = :fuelType', { fuelType });
    }
    if (transmission) {
      queryBuilder.andWhere('product.transmission = :transmission', {
        transmission,
      });
    }
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
        queryBuilder.andWhere('CAST(product.year AS UNSIGNED) >= :yearStart', {
          yearStart,
        });
      } else if (yearEnd !== undefined) {
        queryBuilder.andWhere('CAST(product.year AS UNSIGNED) <= :yearEnd', {
          yearEnd,
        });
      }
    }

    if (cityId) {
      queryBuilder.andWhere('city.id = :cityId', { cityId });
    }

    if (typecar) {
      const saleTypes = [
        Type_rental_both_sale_car.SALE,
        Type_rental_both_sale_car.BOTH,
      ];
      const rentalTypes = [
        Type_rental_both_sale_car.RENTAL,
        Type_rental_both_sale_car.BOTH,
      ];

      if (saleTypes.includes(typecar)) {
        if (minSalePrice !== undefined) {
          queryBuilder.andWhere('product.salePrice >= :minSalePrice', {
            minSalePrice,
          });
        }
        if (maxSalePrice !== undefined) {
          queryBuilder.andWhere('product.salePrice <= :maxSalePrice', {
            maxSalePrice,
          });
        }
      }
      if (rentalTypes.includes(typecar)) {
        if (minDailyRate !== undefined) {
          queryBuilder.andWhere('product.dailyRate >= :minDailyRate', {
            minDailyRate,
          });
        }
        if (maxDailyRate !== undefined) {
          queryBuilder.andWhere('product.dailyRate <= :maxDailyRate', {
            maxDailyRate,
          });
        }
      }
      queryBuilder.andWhere('product.typecar = :typecar', { typecar });
    }

    // ============================================================
    // TRI ALEATOIRE A CHAQUE EXECUTION
    // ============================================================

    queryBuilder.orderBy('RAND()').skip(skip).take(limit);

    const [products, total] = await Promise.all([
      queryBuilder.getMany(),
      queryBuilder.getCount(),
    ]);

    if (products.length === 0) {
      return {
        message: await this.i18n.translate('no_products_found', lang),
        data: { data: [], total: 0, page, limit },
      };
    }

    const companyIds = [
      ...new Set(products.map((p) => p.company?.id).filter(Boolean)),
    ];

    let companyStatsMap = new Map();

    if (companyIds.length > 0) {
      const companyProductsStats = await this.productRepo
        .createQueryBuilder('p')
        .select([
          'p.companyId as companyId',
          'COUNT(p.id) as totalProduct',
          'COUNT(DISTINCT p.category_id) as totalCategory',
        ])
        .where('p.companyId IN (:...companyIds)', { companyIds })
        .andWhere('p.status = :status', { status: ProductStatus.PUBLISHED })
        .groupBy('p.companyId')
        .getRawMany();

      const orderStats = await this.orderItemRepo
        .createQueryBuilder('item')
        .innerJoin('item.product', 'product')
        .select([
          'product.companyId as companyId',
          'COUNT(DISTINCT item.orderId) as totalCommande',
        ])
        .where('product.companyId IN (:...companyIds)', { companyIds })
        .groupBy('product.companyId')
        .getRawMany();

      for (const cid of companyIds) {
        const productStat = companyProductsStats.find(
          (p) => p.companyId === cid,
        );
        const orderStat = orderStats.find((o) => o.companyId === cid);

        companyStatsMap.set(cid, {
          totalProduct: Number(productStat?.totalProduct || 0),
          totalCategory: Number(productStat?.totalCategory || 0),
          totalCommande: Number(orderStat?.totalCommande || 0),
        });
      }
    }

    let companyProductsCache = new Map();

    for (const cid of companyIds) {
      if (companyStatsMap.get(cid)?.totalProduct > 0) {
        const productsList = await this.productRepo.find({
          where: { company: { id: cid }, status: ProductStatus.PUBLISHED },
          relations: ['category'],
          take: 50,
        });
        companyProductsCache.set(cid, productsList);
      }
    }

    const formattedProducts = products.map((product) => {
      const companyId = product.company?.id;
      const stats = companyStatsMap.get(companyId) || {
        totalProduct: 0,
        totalCategory: 0,
        totalCommande: 0,
      };

      const companyProductsForStats = companyProductsCache.get(companyId) || [];

      const catMap = new Map();
      companyProductsForStats.forEach((p) => {
        if (p.category) catMap.set(p.category.id, p.category);
      });

      if (product.company?.userHasCompany) {
        product.company.userHasCompany.forEach((uhc) => {
          if (uhc.user && (uhc.user as any).password) {
            delete (uhc.user as any).password;
          }
        });
      }

      return {
        ...product,
        images:
          product.images?.map((img) => ({ id: img.id, url: img.url })) || [],
        specificationValues:
          product.specificationValues?.map((sv) => ({
            id: sv.id,
            value: sv.value,
            specification: sv.specification
              ? {
                id: sv.specification.id,
                label: sv.specification.label,
              }
              : null,
          })) || [],
        attributes: product.attributes || [],
        variations: product.variations || [],
        company: product.company
          ? {
            ...product.company,
            start: {
              totalProduct: stats.totalProduct,
              totalCategory: stats.totalCategory,
              totalCommande: stats.totalCommande,
            },
            products: companyProductsForStats,
            categories: Array.from(catMap.values()),
          }
          : null,
      };
    });

    let message = await this.i18n.translate('products_by_category', lang);
    const filters: string[] = [];

    if (categoryId) filters.push(`catégorie: ${categoryId}`);
    if (brandId) filters.push(`marque: ${brandId}`);
    if (type) filters.push(`type: ${type}`);
    if (shopType) filters.push(`type boutique: ${shopType}`);
    if (fuelType) filters.push(`carburant: ${fuelType}`);
    if (transmission) filters.push(`transmission: ${transmission}`);
    if (typecar) filters.push(`type véhicule: ${typecar}`);
    if (year) filters.push(`année: ${year}`);
    if (companyId) filters.push(`entreprise: ${companyId}`);
    if (cityId) filters.push(`ville: ${cityId}`);

    if (filters.length > 0 && total > 0) {
      message += ` (filtres: ${filters.join(', ')})`;
    }

    if (total === 0) {
      message = await this.i18n.translate('no_products_found', lang);
      if (filters.length > 0) {
        message += ` avec les filtres: ${filters.join(', ')}`;
      }
    }

    return {
      message,
      data: {
        data: formattedProducts,
        total,
        page,
        limit,
      },
    };
  }

  async findByActiveCompanyForUser(
    user: UserEntity,
    page = 1,
    limit = 10,
    lang: string = 'fr',
  ): Promise<any> {
    if (!user.activeCompanyId) {
      throw new BadRequestException(await this.i18n.translate('no_active_company', lang));
    }

    const company = await this.companyRepo.findOne({
      where: { id: user.activeCompanyId },
    });

    if (!company) {
      throw new NotFoundException(await this.i18n.translate('company_not_found', lang));
    }

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
      message: await this.i18n.translate('products_retrieved', lang),
      data: {
        data: products,
        total,
        page,
        limit,
      },
    };
  }

  async groupByType(lang: string = 'fr'): Promise<Record<string, Product[]>> {
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

  async findAllGroupedByCategory(
    categoryId?: string,
    lang: string = 'fr',
  ): Promise<{
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
        product.category ||
        ({ name: 'Aucune catégorie', id: 'no-category' } as CategoryEntity);
      const categoryKey = product.category?.id || 'no-category';

      if (!grouped.has(categoryKey)) {
        const { products: _, ...categoryWithoutProducts } =
          category as CategoryEntity;
        grouped.set(categoryKey, { ...categoryWithoutProducts, products: [] });
      }

      const cleanProduct = { ...product };
      delete cleanProduct.category;

      grouped.get(categoryKey)!.products.push(cleanProduct);
    }

    const result = Array.from(grouped.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    return { data: result };
  }

  async groupByType_First_Product(lang: string = 'fr'): Promise<Record<string, Product>> {
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
      order: { createdAt: 'ASC' },
    });

    const grouped: Record<string, Product> = {};

    for (const product of products) {
      if (!grouped[product.type]) {
        grouped[product.type] = product;
      }
    }

    return grouped;
  }

  async searchProducts(
    search: string,
    lang: string = 'fr',
  ): Promise<{ message: string; data: Product[] }> {
    if (!search || search.trim() === '') {
      return {
        message: await this.i18n.translate('search_no_results', lang),
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
      .leftJoinAndSelect(
        'variations.attributeValues',
        'variationAttributeValues',
      )
      .leftJoinAndSelect(
        'variationAttributeValues.attribute',
        'variationAttribute',
      )
      .where('product.status = :status', { status: ProductStatus.PUBLISHED });

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
      throw new NotFoundException(
        await this.i18n.translate('search_no_results', lang),
      );
    }

    return {
      message: await this.i18n.translate('search_results', lang),
      data: results,
    };
  }

  async updateStatus(
    id: string,
    dto: UpdateProductStatusDto,
    user: UserEntity,
    lang: string = 'fr',
  ): Promise<{ message: string; data: Product }> {
    const product = await this.productRepo.findOne({
      where: { id },
      relations: ['company'],
    });

    if (!product) {
      throw new NotFoundException(await this.i18n.translate('product_not_found', lang));
    }

    if (!user) {
      throw new ForbiddenException(await this.i18n.translate('user_not_authenticated', lang));
    }

    product.status = dto.status;
    await this.productRepo.save(product);

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
      throw new NotFoundException(await this.i18n.translate('product_not_found', lang));
    }
    return {
      message: await this.i18n.translate('product_status_updated', lang),
      data: updated,
    };
  }

  async getBestSellingProducts(
    page = 1,
    limit = 5,
    type: string = CompanyType.SHOP,
    lang: string = 'fr',
    countryId?: string,
    cityId?: string,
  ) {
    const offset = (page - 1) * limit;

    // ============================================================
    // PRODUITS LES PLUS VENDUS
    // ============================================================

    let query = this.orderItemRepo
      .createQueryBuilder('orderItem')
      .select('orderItem.productId', 'productId')
      .addSelect('SUM(orderItem.quantity)', 'totalSold')
      .leftJoin('orderItem.product', 'product')
      .leftJoin('product.company', 'company')
      .leftJoin('company.country', 'country')
      .leftJoin('company.city', 'city')
      .where('product.type = :type', { type })
      .andWhere('product.status = :status', { status: ProductStatus.PUBLISHED });

    if (countryId) {
      query = query.andWhere('country.id = :countryId', { countryId });
    }

    if (cityId) {
      query = query.andWhere('city.id = :cityId', { cityId });
    }

    query = query
      .groupBy('orderItem.productId')
      .orderBy('SUM(orderItem.quantity)', 'DESC')
      .addOrderBy('orderItem.productId', 'ASC')
      .offset(offset)
      .limit(limit);

    const results = await query.getRawMany();
    const productIds = results.map((r) => r.productId);

    if (productIds.length === 0) {
      return {
        message: await this.i18n.translate('no_products_found', lang),
        data: {
          data: [],
          total: 0,
          page,
          limit,
        },
      };
    }

    // ============================================================
    // RÉCUPÉRER LES PRODUITS
    // ============================================================

    const products = await this.productRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.company', 'company')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('company.city', 'city')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.measure', 'measure')
      .leftJoinAndSelect('product.images', 'images')
      .leftJoinAndSelect('product.brand', 'brand')
      .leftJoinAndSelect('company.tauxCompanies', 'tauxCompanies')
      .leftJoinAndSelect('product.specificationValues', 'specificationValues')
      .leftJoinAndSelect('specificationValues.specification', 'specification')
      .leftJoinAndSelect('product.attributes', 'attributes')
      .leftJoinAndSelect('attributes.attribute', 'attribute')
      .leftJoinAndSelect('product.variations', 'variations')
      .leftJoinAndSelect('variations.image', 'variationImage')
      .leftJoinAndSelect('variations.attributeValues', 'variationAttributeValues')
      .leftJoinAndSelect('variationAttributeValues.attribute', 'variationAttribute')
      .where('product.id IN (:...productIds)', { productIds })
      .getMany();

    // ============================================================
    // MAPPER totalSold
    // ============================================================

    let productsWithSales = products.map((p) => ({
      ...p,
      totalSold: Number(
        results.find((r) => r.productId === p.id)?.totalSold || 0,
      ),
    }));

    // ============================================================
    // MÉLANGE ALÉATOIRE (Fisher-Yates Shuffle)
    // ============================================================

    for (let i = productsWithSales.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [productsWithSales[i], productsWithSales[j]] = [
        productsWithSales[j],
        productsWithSales[i],
      ];
    }

    // ============================================================
    // TOTAL
    // ============================================================

    let totalQuery = this.orderItemRepo
      .createQueryBuilder('orderItem')
      .select('COUNT(DISTINCT orderItem.productId)', 'cnt')
      .leftJoin('orderItem.product', 'product')
      .leftJoin('product.company', 'company')
      .leftJoin('company.country', 'country')
      .leftJoin('company.city', 'city')
      .where('product.type = :type', { type })
      .andWhere('product.status = :status', { status: ProductStatus.PUBLISHED });

    if (countryId) {
      totalQuery = totalQuery.andWhere('country.id = :countryId', { countryId });
    }

    if (cityId) {
      totalQuery = totalQuery.andWhere('city.id = :cityId', { cityId });
    }

    const totalRaw = await totalQuery.getRawOne();
    const totalCount = Number(totalRaw?.cnt || 0);

    // ============================================================
    // RESPONSE
    // ============================================================

    return {
      message: await this.i18n.translate('best_selling_products', lang),
      data: {
        data: productsWithSales,
        total: totalCount,
        page,
        limit,
      },
    };
  }
  /**
 * Récupère les produits de type restaurant par jour de la semaine avec rotation
 */
  async getRestaurantProductsByDay(
    day?: string,
    lang: string = 'fr',
    filters?: {
      categoryId?: string;
      brandId?: string;
      companyId?: string;
      cityId?: string;
      countryId?: string;
      minPrice?: number;
      maxPrice?: number;
      search?: string;
      page?: number;
      limit?: number;
      includeSpecifications?: boolean;
      includeVariations?: boolean;
    }
  ): Promise<{
    message: string;
    data: {
      data: (Product & { day: string; position: number })[];
      total: number;
      page: number;
      limit: number;
    };
    day?: string;
  }> {
    // Paramètres de pagination
    const page = Math.max(filters?.page || 1, 1);
    const limit = Math.min(filters?.limit || 20, 100);
    const includeSpecs = filters?.includeSpecifications !== false;
    const includeVars = filters?.includeVariations !== false;

    // ✅ Définition des jours de la semaine
    const daysOfWeek = [
      { key: 'monday', label: 'Lundi', order: 1 },
      { key: 'tuesday', label: 'Mardi', order: 2 },
      { key: 'wednesday', label: 'Mercredi', order: 3 },
      { key: 'thursday', label: 'Jeudi', order: 4 },
      { key: 'friday', label: 'Vendredi', order: 5 },
      { key: 'saturday', label: 'Samedi', order: 6 },
      { key: 'sunday', label: 'Dimanche', order: 7 },
    ];

    // ✅ Construction de la requête principale
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
      .where('product.type = :type', { type: CompanyType.RESTAURANT })
      .andWhere('product.status = :status', { status: ProductStatus.PUBLISHED })
      .andWhere('company.status = :companyStatus', {
        companyStatus: CompanyStatus.VALIDATED,
      });

    // ✅ Charger les spécifications seulement si demandé
    if (includeSpecs) {
      queryBuilder
        .leftJoinAndSelect('product.specificationValues', 'specificationValues')
        .leftJoinAndSelect('specificationValues.specification', 'specification');
    }

    // ✅ Charger les variations seulement si demandé
    if (includeVars) {
      queryBuilder
        .leftJoinAndSelect('product.variations', 'variations')
        .leftJoinAndSelect('variations.image', 'variationImage')
        .leftJoinAndSelect(
          'variations.attributeValues',
          'variationAttributeValues',
        )
        .leftJoinAndSelect(
          'variationAttributeValues.attribute',
          'variationAttribute',
        );
    }

    // ✅ Appliquer les filtres
    if (filters) {
      if (filters.categoryId) {
        queryBuilder.andWhere(
          '(category.id = :categoryId OR categoryParent.id = :categoryId OR categoryChildren.id = :categoryId)',
          { categoryId: filters.categoryId },
        );
      }

      if (filters.brandId) {
        queryBuilder.andWhere('product.brand_id = :brandId', {
          brandId: filters.brandId,
        });
      }

      if (filters.companyId) {
        queryBuilder.andWhere('product.companyId = :companyId', {
          companyId: filters.companyId,
        });
      }

      if (filters.countryId) {
        queryBuilder.andWhere('company.countryId = :countryId', {
          countryId: filters.countryId,
        });
      }

      if (filters.cityId) {
        queryBuilder.andWhere('company.cityId = :cityId', {
          cityId: filters.cityId,
        });
      }

      if (filters.minPrice !== undefined) {
        queryBuilder.andWhere('product.price >= :minPrice', {
          minPrice: filters.minPrice,
        });
      }
      if (filters.maxPrice !== undefined) {
        queryBuilder.andWhere('product.price <= :maxPrice', {
          maxPrice: filters.maxPrice,
        });
      }

      if (filters.search && filters.search.trim() !== '') {
        queryBuilder.andWhere('LOWER(product.name) LIKE :search', {
          search: `%${filters.search.toLowerCase().trim()}%`,
        });
      }
    }

    // ✅ Appliquer le tri
    queryBuilder.orderBy('product.createdAt', 'DESC');

    // ✅ Exécuter la requête
    const products = await queryBuilder.getMany();

    // ✅ Fonction de rotation des produits
    const rotateProducts = (productList: Product[], dayIndex: number): Product[] => {
      if (productList.length === 0) return [];

      const sorted = [...productList];
      sorted.sort((a, b) => (b.price || 0) - (a.price || 0));

      const rotationFactor = dayIndex + 1;
      const half = Math.ceil(sorted.length / 2);
      const firstHalf = sorted.slice(0, half);
      const secondHalf = sorted.slice(half);

      const interleaved: Product[] = [];
      const maxLength = Math.max(firstHalf.length, secondHalf.length);

      for (let i = 0; i < maxLength; i++) {
        if (i < firstHalf.length) {
          const index = (i + rotationFactor) % firstHalf.length;
          interleaved.push(firstHalf[index]);
        }
        if (i < secondHalf.length) {
          const index = (i + rotationFactor * 2) % secondHalf.length;
          interleaved.push(secondHalf[index]);
        }
      }

      const final: Product[] = [];
      const step = Math.max(1, Math.floor(interleaved.length / 7));
      for (let i = 0; i < interleaved.length; i++) {
        const sourceIndex = (i * step + dayIndex * 3) % interleaved.length;
        final.push(interleaved[sourceIndex]);
      }

      return final;
    };

    // ✅ Si un jour spécifique est demandé
    if (day) {
      const dayKey = day.toLowerCase();
      const dayIndex = daysOfWeek.findIndex((d) => d.key === dayKey);

      if (dayIndex === -1) {
        throw new BadRequestException(
          await this.i18n.translate('invalid_day', lang, {
            day: day,
            available: daysOfWeek.map((d) => d.key).join(', '),
          }),
        );
      }

      const rotatedProducts = rotateProducts(products, dayIndex);
      const start = (page - 1) * limit;
      const paginatedProducts = rotatedProducts.slice(start, start + limit);

      // ✅ Ajouter le jour et la position à chaque produit
      const dataWithDay = paginatedProducts.map((product, index) => ({
        ...product,
        day: dayKey,
        position: start + index + 1,
      }));

      return {
        message: await this.i18n.translate('restaurant_products_by_day', lang, {
          day: daysOfWeek[dayIndex].label,
        }),
        data: {
          data: dataWithDay,
          total: rotatedProducts.length,
          page: page,
          limit: limit,
        },
        day: dayKey,
      };
    }

    // ✅ Si aucun jour spécifique, retourner tous les jours en liste plate
    // 1. D'abord, générer toutes les listes rotées pour chaque jour
    const allRotatedProducts: { product: Product; day: string; dayIndex: number }[] = [];

    for (let i = 0; i < daysOfWeek.length; i++) {
      const day = daysOfWeek[i];
      const rotated = rotateProducts(products, i);

      rotated.forEach((product) => {
        allRotatedProducts.push({
          product,
          day: day.key,
          dayIndex: i,
        });
      });
    }

    // 2. Calculer le total avant pagination
    const totalCount = allRotatedProducts.length;

    // 3. Appliquer la pagination sur l'ensemble
    const start = (page - 1) * limit;
    const paginatedAll = allRotatedProducts.slice(start, start + limit);

    // 4. Ajouter la position à chaque produit paginé
    const dataWithDay = paginatedAll.map((item, index) => ({
      ...item.product,
      day: item.day,
      position: start + index + 1,
    }));

    return {
      message: await this.i18n.translate('restaurant_products_all_days', lang),
      data: {
        data: dataWithDay,
        total: totalCount,
        page: page,
        limit: limit,
      },
    };
  }

  async addToWishlist(user: UserEntity, dto: CreateWishlistDto, lang: string = 'fr') {
    if (!user || !user.id) {
      throw new BadRequestException(await this.i18n.translate('user_not_authenticated', lang));
    }

    if (!dto.productId) {
      throw new BadRequestException(await this.i18n.translate('product_id_required', lang));
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

    if (!product) throw new NotFoundException(await this.i18n.translate('product_not_found', lang));

    const existing = await this.wishlistRepo.findOne({
      where: { user: { id: user.id }, product: { id: product.id } },
    });

    if (existing) {
      await this.wishlistRepo.remove(existing);
      return {
        message: await this.i18n.translate('wishlist_removed', lang),
        data: null,
      };
    }

    const wishlistItem = this.wishlistRepo.create({
      user,
      product,
      deleted: false,
      status: true,
      shopType: dto.shopType,
    });

    await this.wishlistRepo.save(wishlistItem);

    return {
      message: await this.i18n.translate('wishlist_added', lang),
      data: product,
    };
  }

  async getUserWishlist(user: UserEntity, lang: string = 'fr') {
    if (!user?.id) {
      throw new BadRequestException(await this.i18n.translate('user_not_authenticated', lang));
    }

    const wishlistItems = await this.wishlistRepo.find({
      where: {
        user: { id: user.id },
        deleted: false,
        status: true,
      },
      relations: [
        'user',
        'product',
        'product.images',
        'product.category',
        'product.measure',
        'product.brand',
        'product.company',
        'product.company.tauxCompanies',
        'product.company.country',
        'product.company.city',
        'product.specificationValues',
        'product.specificationValues.specification',
        'product.attributes',
        'product.attributes.attribute',
        'product.variations',
        'product.variations.image',
        'product.variations.attributeValues',
        'product.variations.attributeValues.attribute',
      ],
      order: { createdAt: 'DESC' },
    });

    return {
      message: await this.i18n.translate('wishlist_retrieved', lang),
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

  async removeFromWishlist(user: UserEntity, productId: string, lang: string = 'fr') {
    const item = await this.wishlistRepo.findOne({
      where: {
        user: { id: user.id },
        product: { id: productId },
        deleted: false,
      },
    });

    if (!item) {
      throw new NotFoundException(await this.i18n.translate('wishlist_removed', lang));
    }

    item.deleted = true;
    item.status = false;
    await this.wishlistRepo.save(item);

    return {
      message: await this.i18n.translate('wishlist_removed', lang),
      data: null,
    };
  }

  async search(
    keyword?: string,
    type?: CompanyType,
    lang: string = 'fr',
    countryId?: string,  // Ajout du paramètre optionnel
    cityId?: string,     // Ajout du paramètre optionnel
  ) {
    if (!keyword || keyword.trim() === '') {
      return {
        data: {
          [CompanyType.RESTAURANT]: [],
          [CompanyType.GROCERY]: [],
          [CompanyType.SHOP]: [],
          [CompanyType.SERVICE]: [],
          [CompanyType.CAR]: [],
          PRODUCT: [],
          SERVICE_LIST: [],
          HOTEL_LIST: [],
        },
      };
    }

    const searchKey = `%${keyword.trim().toLowerCase()}%`;

    const companyQuery = this.companyRepo
      .createQueryBuilder('company')
      .leftJoinAndSelect('company.userHasCompany', 'userHasCompany')
      .leftJoinAndSelect('company.products', 'products')
      .leftJoinAndSelect('products.brand', 'brand')
      .leftJoinAndSelect('company.measures', 'measures')
      .leftJoinAndSelect('company.services', 'services')
      .leftJoinAndSelect('company.rooms', 'rooms')
      .leftJoinAndSelect('company.tauxCompanies', 'tauxCompanies')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('company.city', 'city')
      .where('LOWER(company.companyName) LIKE :searchKey', { searchKey })
      .andWhere('company.status = :validatedStatus', {
        validatedStatus: 'VALIDATED',
      });

    // Ajout des filtres country et city pour les compagnies
    if (countryId) {
      companyQuery.andWhere('country.id = :countryId', { countryId });
    }
    if (cityId) {
      companyQuery.andWhere('city.id = :cityId', { cityId });
    }

    if (type) {
      companyQuery.andWhere('company.typeCompany = :type', { type });
    }

    const companies = await companyQuery.distinct(true).getMany();

    const productQuery = this.productRepo
      .createQueryBuilder('product')
      .innerJoinAndSelect('product.company', 'company')
      .leftJoinAndSelect('company.tauxCompanies', 'tauxCompanies')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('company.city', 'city')
      .innerJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('category.parent', 'parentCategory')
      .leftJoinAndSelect('product.brand', 'brand')
      .leftJoinAndSelect('product.measure', 'measure')
      .leftJoinAndSelect('product.images', 'images')
      .leftJoinAndSelect('product.specificationValues', 'specificationValues')
      .leftJoinAndSelect('specificationValues.specification', 'specification')
      .leftJoinAndSelect('product.attributes', 'attributes')
      .leftJoinAndSelect('attributes.attribute', 'attribute')
      .leftJoinAndSelect('product.variations', 'variations')
      .leftJoinAndSelect('variations.image', 'variationImage')
      .leftJoinAndSelect(
        'variations.attributeValues',
        'variationAttributeValues',
      )
      .leftJoinAndSelect(
        'variationAttributeValues.attribute',
        'variationAttribute',
      )
      .where(
        `(
        LOWER(product.name) LIKE :searchKey
        OR LOWER(product.description) LIKE :searchKey
        OR LOWER(category.name) LIKE :searchKey
        OR LOWER(parentCategory.name) LIKE :searchKey
        OR LOWER(brand.name) LIKE :searchKey
      )
      AND product.status = :productStatus
      AND company.status = :companyStatus`,
        {
          searchKey,
          productStatus: ProductStatus.PUBLISHED,
          companyStatus: CompanyStatus.VALIDATED,
        },
      );

    // Ajout des filtres country et city pour les produits
    if (countryId) {
      productQuery.andWhere('country.id = :countryId', { countryId });
    }
    if (cityId) {
      productQuery.andWhere('city.id = :cityId', { cityId });
    }

    if (type) {
      productQuery.andWhere('company.typeCompany = :type', { type });
    }

    const products = await productQuery
      .distinct(true)
      .orderBy('product.createdAt', 'DESC')
      .getMany();

    const serviceQuery = this.serviceRepo
      .createQueryBuilder('service')
      .innerJoinAndSelect('service.company', 'company')
      .leftJoinAndSelect('company.tauxCompanies', 'tauxCompanies')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('company.city', 'city')
      .innerJoinAndSelect('service.category', 'category')
      .leftJoinAndSelect('category.parent', 'parentCategory')
      .leftJoinAndSelect('service.measure', 'measure')
      .leftJoinAndSelect('service.prestataires', 'prestataires')
      .leftJoinAndSelect('prestataires.prestataire', 'prestataire')
      .where(
        `(
        LOWER(service.name) LIKE :searchKey
        OR LOWER(service.description) LIKE :searchKey
        OR LOWER(category.name) LIKE :searchKey
        OR LOWER(parentCategory.name) LIKE :searchKey
      )
      AND company.status = :companyStatus`,
        { searchKey, companyStatus: CompanyStatus.VALIDATED },
      );

    // Ajout des filtres country et city pour les services
    if (countryId) {
      serviceQuery.andWhere('country.id = :countryId', { countryId });
    }
    if (cityId) {
      serviceQuery.andWhere('city.id = :cityId', { cityId });
    }

    if (type) {
      serviceQuery.andWhere('company.typeCompany = :type', { type });
    }

    const services = await serviceQuery
      .distinct(true)
      .orderBy('service.createdAt', 'DESC')
      .getMany();

    const groupedResults: Record<string, any> = {
      [CompanyType.RESTAURANT]: [],
      [CompanyType.GROCERY]: [],
      [CompanyType.SHOP]: [],
      [CompanyType.SERVICE]: [],
      [CompanyType.CAR]: [],
      PRODUCT: [],
      SERVICE_LIST: [],
      HOTEL_LIST: [],
    };

    for (const company of companies) {
      if (groupedResults[company.typeCompany]) {
        groupedResults[company.typeCompany].push(company);
      }
      if (company.typeCompany === CompanyType.HOTEL) {
        groupedResults.HOTEL_LIST.push(company);
      }
    }

    for (const prod of products) {
      if (
        [CompanyType.SHOP, CompanyType.CAR].includes(prod.company?.typeCompany)
      ) {
        groupedResults.PRODUCT.push(prod);
      }
    }

    for (const serv of services) {
      groupedResults.SERVICE_LIST.push(serv);
    }

    return {
      message:
        companies.length === 0 && products.length === 0 && services.length === 0
          ? await this.i18n.translate('no_search_results', lang)
          : await this.i18n.translate('search_results', lang),
      data: groupedResults,
    };
  }

  async createBrand(
    createBrandDto: CreateBrandDto,
    file: Express.Multer.File,
    lang: string = 'fr',
  ): Promise<{ message: string; data?: Brand }> {
    const { name, type, status } = createBrandDto;

    if (!file) {
      throw new BadRequestException(await this.i18n.translate('image_required', lang));
    }

    const existingBrand = await this.brandRepository.findOne({
      where: { name },
    });
    if (existingBrand) {
      return {
        message: await this.i18n.translate('brand_already_exists', lang, { name }),
      };
    }

    const slug = slugify(name, { lower: true, strict: true });

    const uploadedFile = await this.filesService.uploadFile(
      file,
      'brand',
      'avatar',
    );
    const imageUrl = uploadedFile.data;

    const brand = this.brandRepository.create({
      name,
      type,
      status: status ?? true,
      image: imageUrl,
      slug,
    });

    const savedBrand = await this.brandRepository.save(brand);

    return {
      message: await this.i18n.translate('brand_created', lang),
      data: savedBrand,
    };
  }

  async updateBrand(
    id: string,
    updateBrandDto: UpdateBrandDto,
    file?: Express.Multer.File,
    lang: string = 'fr',
  ): Promise<{ message: string; data: Brand }> {
    const brand = await this.brandRepository.findOne({ where: { id } });
    if (!brand) {
      throw new NotFoundException(await this.i18n.translate('brand_not_found', lang));
    }

    if (file) {
      if (brand.image) {
        try {
          const oldFilename = brand.image.split('/').pop()!;
          await this.filesService.deleteFile('brand', oldFilename);
        } catch (err) {
          this.logger.warn('Impossible de supprimer l’ancienne image:', err);
        }
      }

      const uploadedFile = await this.filesService.uploadFile(
        file,
        'brand',
        'avatar',
      );
      updateBrandDto.image = uploadedFile.data;
    }

    if (updateBrandDto.name && updateBrandDto.name !== brand.name) {
      const existingBrand = await this.brandRepository.findOne({
        where: { name: updateBrandDto.name },
      });
      if (existingBrand && existingBrand.id !== id) {
        throw new ConflictException(await this.i18n.translate('brand_already_exists', lang, { name: updateBrandDto.name }));
      }
    }

    Object.assign(brand, updateBrandDto);

    const updatedBrand = await this.brandRepository.save(brand);

    return {
      message: await this.i18n.translate('brand_updated', lang),
      data: updatedBrand,
    };
  }

  async findAllBrand(
    type?: string,
    lang: string = 'fr',
  ): Promise<{ message: string; data: Brand[] }> {
    const whereCondition = type ? { type } : {};

    const brands = await this.brandRepository.find({
      where: whereCondition,
      order: { createdAt: 'DESC' },
    });

    return {
      message: await this.i18n.translate('brands_retrieved', lang),
      data: brands,
    };
  }

  async findOneBrand(id: string, lang: string = 'fr'): Promise<{ message: string; data: Brand }> {
    const brand = await this.brandRepository.findOne({ where: { id } });
    if (!brand) {
      throw new NotFoundException(await this.i18n.translate('brand_not_found', lang));
    }

    return {
      message: await this.i18n.translate('brand_retrieved', lang),
      data: brand,
    };
  }

  async deleteFromCloudinary(
    fileUrls: string | string[],
    lang: string = 'fr',
  ): Promise<{ message: string }> {
    if (!fileUrls || (Array.isArray(fileUrls) && fileUrls.length === 0)) {
      throw new BadRequestException(await this.i18n.translate('image_required', lang));
    }

    const filesToDelete = Array.isArray(fileUrls) ? fileUrls : [fileUrls];

    const products = await this.productRepo.find({
      where: filesToDelete.map((url) => ({ image: url })),
    });

    const images = await this.imageRepository.find({
      where: filesToDelete.map((url) => ({ url })),
    });

    if (products.length === 0 && images.length === 0) {
      return {
        message: await this.i18n.translate('images_deleted', lang),
      };
    }

    if (products.length > 0) {
      const productNames = products.map((p) => p.name || p.id).join(', ');
      throw new BadRequestException(
        await this.i18n.translate('image_used_as_main', lang, { productNames }),
      );
    }

    for (const img of images) {
      try {
        const filename = img.url.split('/').pop()!;
        await this.filesService.deleteFile('product', filename);
        await this.imageRepository.remove(img);
      } catch (error) {
        throw new BadRequestException(
          await this.i18n.translate('image_deletion_error', lang, { url: img.url, error: error.message }),
        );
      }
    }

    return {
      message: await this.i18n.translate('images_deleted', lang),
    };
  }

  async updateProductImage(
    productId: string,
    imageUrl: string,
    lang: string = 'fr',
  ): Promise<Product> {
    const product = await this.productRepo.findOne({
      where: { id: productId },
    });
    if (!product) {
      throw new NotFoundException(await this.i18n.translate('product_not_found', lang));
    }

    if (product.image === imageUrl) {
      return product;
    }

    await this.productRepo
      .createQueryBuilder()
      .update(Product)
      .set({ image: imageUrl })
      .where('id = :id', { id: product.id })
      .execute();

    const updatedProduct = await this.productRepo.findOne({
      where: { id: product.id },
    });
    if (!updatedProduct) {
      throw new NotFoundException(await this.i18n.translate('product_not_found', lang));
    }

    return updatedProduct;
  }

  async processAndUploadImage(file: Express.Multer.File, lang: string = 'fr'): Promise<string> {
    if (!file) {
      throw new BadRequestException(await this.i18n.translate('image_required', lang));
    }

    const uploadedFile = await this.filesService.uploadFile(
      file,
      'product-preview',
      'product',
    );

    return uploadedFile.data;
  }
}