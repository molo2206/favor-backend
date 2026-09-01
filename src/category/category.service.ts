/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CategoryEntity } from './entities/category.entity';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { slugify } from 'src/users/utility/slug/slugify';
import { CloudinaryService } from 'src/users/utility/helpers/cloudinary.service';
import { CategorySpecification } from 'src/specification/entities/CategorySpecification.entity';
import { CategorySpecificationService } from 'src/specification/category-specification.service';
import { CategoryAttribute } from 'src/AttributGlobal/entities/category_attributes.entity';
import { Attribute } from 'src/AttributGlobal/entities/attributes.entity';
import { Product } from 'src/products/entities/product.entity';
import { FilesService } from 'src/files/files.service';

// Dictionnaire interne des traductions
const translations: Record<string, Record<string, string>> = {
  'category.error.duplicate_subcategory': {
    fr: 'Une sous-catégorie avec ce nom existe déjà dans cette catégorie parente',
    en: 'A subcategory with this name already exists in this parent category',
    sw: 'Kategoria ndogo yenye jina hili tayari ipo katika kategoria kuu',
    es: 'Ya existe una subcategoría con este nombre en esta categoría principal',
    ar: 'يوجد بالفعل فئة فرعية بهذا الاسم في هذه الفئة الرئيسية',
  },
  'category.error.duplicate_main': {
    fr: 'Une catégorie principale avec ce nom et ce type existe déjà',
    en: 'A main category with this name and type already exists',
    sw: 'Kategoria kuu yenye jina hili na aina hii tayari ipo',
    es: 'Ya existe una categoría principal con este nombre y tipo',
    ar: 'يوجد بالفعل فئة رئيسية بهذا الاسم وهذا النوع',
  },
  'category.error.parent_not_found': {
    fr: 'Catégorie parente non trouvée',
    en: 'Parent category not found',
    sw: 'Kategoria kuu haipatikani',
    es: 'Categoría principal no encontrada',
    ar: 'الفئة الأصلية غير موجودة',
  },
  'category.error.parent_type_mismatch': {
    fr: 'La catégorie parente doit avoir le même type que la catégorie créée',
    en: 'The parent category must have the same type as the created category',
    sw: 'Kategoria kuu lazima iwe na aina sawa na kategoria inayoundwa',
    es: 'La categoría principal debe tener el mismo tipo que la categoría creada',
    ar: 'يجب أن تكون الفئة الأصلية من نفس نوع الفئة التي يتم إنشاؤها',
  },
  'category.error.image_required': {
    fr: 'Une image est requise pour créer une catégorie.',
    en: 'An image is required to create a category.',
    sw: 'Picha inahitajika kuunda kategoria.',
    es: 'Se requiere una imagen para crear una categoría.',
    ar: 'الصورة مطلوبة لإنشاء فئة',
  },
  'category.error.attribute_not_found': {
    fr: 'Attribut {id} introuvable',
    en: 'Attribute {id} not found',
    sw: 'Sifa {id} haipatikani',
    es: 'Atributo {id} no encontrado',
    ar: 'السمة {id} غير موجودة',
  },
  'category.error.not_found': {
    fr: 'Catégorie introuvable',
    en: 'Category not found',
    sw: 'Kategoria haipatikani',
    es: 'Categoría no encontrada',
    ar: 'الفئة غير موجودة',
  },
  'category.error.self_parent': {
    fr: 'Une catégorie ne peut pas être son propre parent',
    en: 'A category cannot be its own parent',
    sw: 'Kategoria haiwezi kuwa kategoria yake kuu',
    es: 'Una categoría no puede ser su propio padre',
    ar: 'لا يمكن أن تكون الفئة هي نفسها الفئة الأصلية',
  },
  'category.error.circular_dependency': {
    fr: 'Impossible de définir ce parent : dépendance circulaire détectée',
    en: 'Cannot set this parent: circular dependency detected',
    sw: 'Haiwezi kuweka kategoria kuu hii: utegemezi wa mzunguko umegunduliwa',
    es: 'No se puede establecer este padre: dependencia circular detectada',
    ar: 'لا يمكن تعيين هذه الفئة الأصلية: تم اكتشاف اعتماد دائري',
  },
  'category.error.parent_type_mismatch_update': {
    fr: 'Le type de la catégorie doit correspondre au type de la catégorie parente',
    en: 'The category type must match the parent category type',
    sw: 'Aina ya kategoria lazima ilingane na aina ya kategoria kuu',
    es: 'El tipo de categoría debe coincidir con el tipo de la categoría principal',
    ar: 'يجب أن يتطابق نوع الفئة مع نوع الفئة الأصلية',
  },
  'category.error.specification_id_required': {
    fr: 'Chaque specification doit contenir un specificationId',
    en: 'Each specification must contain a specificationId',
    sw: 'Kila sifa lazima iwe na specificationId',
    es: 'Cada especificación debe contener un specificationId',
    ar: 'يجب أن تحتوي كل مواصفة على معرف مواصفة',
  },
  'category.error.no_categories_by_type': {
    fr: 'Aucune catégorie trouvée pour le type d’entreprise avec l\'id: {type}',
    en: 'No categories found for company type with id: {type}',
    sw: 'Hakuna kategoria zilizopatikana kwa aina ya kampuni yenye kitambulisho: {type}',
    es: 'No se encontraron categorías para el tipo de empresa con id: {type}',
    ar: 'لم يتم العثور على فئات لنوع الشركة بالمعرف: {type}',
  },
  'category.error.no_categories_by_parent': {
    fr: 'Aucune catégorie trouvée avec le parent "{parent}"',
    en: 'No categories found with parent "{parent}"',
    sw: 'Hakuna kategoria zilizopatikana kwa kategoria kuu "{parent}"',
    es: 'No se encontraron categorías con el padre "{parent}"',
    ar: 'لم يتم العثور على فئات مع الفئة الأصلية "{parent}"',
  },
  'category.error.category_not_found_by_id': {
    fr: 'Catégorie avec l\'ID {id} non trouvée',
    en: 'Category with ID {id} not found',
    sw: 'Kategoria yenye kitambulisho {id} haipatikani',
    es: 'Categoría con ID {id} no encontrada',
    ar: 'لم يتم العثور على فئة بالمعرف {id}',
  },
  'category.success.create': {
    fr: 'Catégorie enregistrée avec succès',
    en: 'Category saved successfully',
    sw: 'Kategoria imehifadhiwa kwa mafanikio',
    es: 'Categoría guardada con éxito',
    ar: 'تم حفظ الفئة بنجاح',
  },
  'category.success.update': {
    fr: 'Catégorie mise à jour avec succès',
    en: 'Category updated successfully',
    sw: 'Kategoria imesasishwa kwa mafanikio',
    es: 'Categoría actualizada con éxito',
    ar: 'تم تحديث الفئة بنجاح',
  },
  'category.success.delete': {
    fr: 'Catégorie supprimée avec succès',
    en: 'Category deleted successfully',
    sw: 'Kategoria imefutwa kwa mafanikio',
    es: 'Categoría eliminada con éxito',
    ar: 'تم حذف الفئة بنجاح',
  },
  'category.message.no_specifications': {
    fr: 'Aucune spécification trouvée pour la catégorie "{name}"',
    en: 'No specifications found for category "{name}"',
    sw: 'Hakuna sifa zilizopatikana kwa kategoria "{name}"',
    es: 'No se encontraron especificaciones para la categoría "{name}"',
    ar: 'لم يتم العثور على مواصفات للفئة "{name}"',
  },
  'category.message.specifications_retrieved': {
    fr: 'Spécifications récupérées avec succès',
    en: 'Specifications retrieved successfully',
    sw: 'Sifa zimepatikana kwa mafanikio',
    es: 'Especificaciones recuperadas con éxito',
    ar: 'تم استرداد المواصفات بنجاح',
  },
  'category.message.no_attributes': {
    fr: 'Aucun attribut trouvé pour la catégorie "{name}"',
    en: 'No attributes found for category "{name}"',
    sw: 'Hakuna sifa za ziada zilizopatikana kwa kategoria "{name}"',
    es: 'No se encontraron atributos para la categoría "{name}"',
    ar: 'لم يتم العثور على سمات للفئة "{name}"',
  },
  'category.message.attributes_retrieved': {
    fr: 'Attributs récupérés avec succès pour la catégorie "{name}"',
    en: 'Attributes retrieved successfully for category "{name}"',
    sw: 'Sifa za ziada zimepatikana kwa mafanikio kwa kategoria "{name}"',
    es: 'Atributos recuperados con éxito para la categoría "{name}"',
    ar: 'تم استرداد السمات بنجاح للفئة "{name}"',
  },
  'category.message.categories_with_products': {
    fr: 'Catégories avec produits récupérées avec succès.',
    en: 'Categories with products retrieved successfully.',
    sw: 'Kategoria zilizo na bidhaa zimepatikana kwa mafanikio.',
    es: 'Categorías con productos recuperadas con éxito.',
    ar: 'تم استرداد الفئات التي تحتوي على منتجات بنجاح',
  },
  'category.message.no_categories_with_products': {
    fr: 'Aucune catégorie avec produit trouvé.',
    en: 'No categories with products found.',
    sw: 'Hakuna kategoria zilizo na bidhaa zilizopatikana.',
    es: 'No se encontraron categorías con productos.',
    ar: 'لم يتم العثور على فئات تحتوي على منتجات',
  },
  'category.message.no_categories': {
    fr: 'Aucune catégorie trouvée.',
    en: 'No categories found.',
    sw: 'Hakuna kategoria zilizopatikana.',
    es: 'No se encontraron categorías.',
    ar: 'لم يتم العثور على فئات',
  },
  'category.error.delete_failed': {
    fr: 'Impossible de supprimer la catégorie',
    en: 'Unable to delete category',
    sw: 'Haiwezi kufuta kategoria',
    es: 'No se puede eliminar la categoría',
    ar: 'غير قادر على حذف الفئة',
  },
};

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(CategoryEntity)
    private readonly categoryRepo: Repository<CategoryEntity>,
    @InjectRepository(CategorySpecification)
    private readonly categorySpecificationRepo: Repository<CategorySpecification>,
    @InjectRepository(CategoryAttribute)
    private readonly categoryAttributeRepo: Repository<CategoryAttribute>,
    @InjectRepository(Attribute)
    private readonly globalAttrRepo: Repository<Attribute>,
    private readonly categorySpecification: CategorySpecificationService,
    private readonly cloudinary: CloudinaryService,
    private readonly filesService: FilesService,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
  ) { }

  private translate(key: string, lang: string, params?: any): string {
    let text = translations[key]?.[lang];
    if (!text) {
      console.warn(`Missing translation for key: ${key}, lang: ${lang}`);
      return key;
    }
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(new RegExp(`{${k}}`, 'g'), String(v));
      });
    }
    return text;
  }

  async create(
    createCategoryDto: CreateCategoryDto,
    file: Express.Multer.File,
    lang: string = 'fr',
  ): Promise<{ message: string; data: CategoryEntity }> {
    const {
      name,
      parentId,
      type,
      color,
      specifications,
      attributes,
      maxPassengers,
      price,
    } = createCategoryDto;

    if (parentId) {
      const existingSubCategory = await this.categoryRepo.findOne({
        where: {
          name,
          type,
          parent: { id: parentId },
        },
      });
      if (existingSubCategory) {
        throw new ConflictException(
          this.translate('category.error.duplicate_subcategory', lang),
        );
      }
    } else {
      const existingMainCategory = await this.categoryRepo.findOne({
        where: {
          name,
          type,
          parent: IsNull(),
        },
      });
      if (existingMainCategory) {
        throw new ConflictException(
          this.translate('category.error.duplicate_main', lang),
        );
      }
    }

    let parent: CategoryEntity | undefined = undefined;
    if (parentId) {
      const foundParent = await this.categoryRepo.findOne({
        where: { id: parentId },
        relations: ['children'],
      });
      if (!foundParent)
        throw new NotFoundException(
          this.translate('category.error.parent_not_found', lang),
        );

      if (foundParent.type !== type) {
        throw new BadRequestException(
          this.translate('category.error.parent_type_mismatch', lang),
        );
      }
      parent = foundParent;
    }

    let slug = slugify(name, { lower: true, strict: true });
    const existingSlug = await this.categoryRepo.findOne({ where: { slug } });
    if (existingSlug) {
      const uniqueSuffix = Date.now().toString().slice(-5);
      slug = `${slug}-${uniqueSuffix}`;
    }

    if (!file)
      throw new BadRequestException(
        this.translate('category.error.image_required', lang),
      );

    const uploadedFile = await this.filesService.uploadFile(
      file,
      'category',
      'category',
    );
    const imageUrl = uploadedFile.data;

    const category = this.categoryRepo.create({
      name,
      slug,
      type,
      color,
      parent: parent ?? undefined,
      image: imageUrl,
      maxPassengers,
      price,
    });

    const savedCategory = await this.categoryRepo.save(category);

    if (specifications && Array.isArray(specifications)) {
      for (const spec of specifications) {
        await this.categorySpecification.addSpecificationToCategory(
          savedCategory.id,
          spec.specificationId,
          spec.required || false,
        );
      }
    }

    if (attributes && Array.isArray(attributes)) {
      const relations: CategoryAttribute[] = [];
      for (const attr of attributes) {
        const attribute = await this.globalAttrRepo.findOne({
          where: { id: attr.attribute_id },
        });
        if (!attribute)
          throw new NotFoundException(
            this.translate('category.error.attribute_not_found', lang, {
              id: attr.attribute_id,
            }),
          );

        const relation = this.categoryAttributeRepo.create({
          category: { id: savedCategory.id },
          attribute,
        });
        relations.push(relation);
      }
      await this.categoryAttributeRepo.save(relations);
    }

    const categoryWithRelations = await this.categoryRepo.findOne({
      where: { id: savedCategory.id },
      relations: [
        'parent',
        'children',
        'specifications',
        'specifications.specification',
        'categoryAttributes',
        'categoryAttributes.attribute',
      ],
    });

    return {
      message: this.translate('category.success.create', lang),
      data: categoryWithRelations!,
    };
  }

  async update(
    id: string,
    updateCategoryDto: UpdateCategoryDto,
    file?: Express.Multer.File,
    lang: string = 'fr',
  ): Promise<{ message: string; data: CategoryEntity }> {
    const category = await this.categoryRepo.findOne({ where: { id } });
    if (!category)
      throw new NotFoundException(this.translate('category.error.not_found', lang));

    const {
      name,
      parentId,
      type,
      color,
      specifications,
      attributes,
      maxPassengers,
      price,
    } = updateCategoryDto;

    if (name) {
      const targetParentId =
        parentId !== undefined ? parentId : category.parent?.id;

      if (targetParentId) {
        const existingSubCategory = await this.categoryRepo.findOne({
          where: {
            name,
            type: type || category.type,
            parent: { id: targetParentId },
            id: Not(id),
          },
        });
        if (existingSubCategory) {
          throw new ConflictException(
            this.translate('category.error.duplicate_subcategory', lang),
          );
        }
      } else {
        const existingMainCategory = await this.categoryRepo.findOne({
          where: {
            name,
            type: type || category.type,
            parent: IsNull(),
            id: Not(id),
          },
        });
        if (existingMainCategory) {
          throw new ConflictException(
            this.translate('category.error.duplicate_main', lang),
          );
        }
      }
    }

    if (type && category.parent && category.parent.type !== type) {
      throw new BadRequestException(
        this.translate('category.error.parent_type_mismatch_update', lang),
      );
    }

    if (name) {
      category.name = name;
      category.slug = slugify(name, { lower: true, strict: true });
    }
    if (type) category.type = type;
    if (color) category.color = color;
    if (maxPassengers !== undefined) category.maxPassengers = maxPassengers;
    if (price !== undefined) category.price = price;

    if (parentId !== undefined) {
      if (parentId === null) {
        category.parent = null;
      } else {
        const parent = await this.categoryRepo.findOne({
          where: { id: parentId },
          relations: ['children'],
        });
        if (!parent)
          throw new NotFoundException(
            this.translate('category.error.parent_not_found', lang),
          );

        if (parentId === id)
          throw new BadRequestException(
            this.translate('category.error.self_parent', lang),
          );

        if (await this.hasCircularDependency(id, parentId)) {
          throw new BadRequestException(
            this.translate('category.error.circular_dependency', lang),
          );
        }

        if (type && parent.type !== type) {
          throw new BadRequestException(
            this.translate('category.error.parent_type_mismatch_update', lang),
          );
        }

        category.parent = parent;
      }
    }

    if (file) {
      if (category.image) {
        try {
          const oldFilename = category.image.split('/').pop()!;
          await this.filesService.deleteFile('category', oldFilename);
        } catch (err) {
          console.warn('Impossible de supprimer l’ancienne image:', err);
        }
      }
      const uploadedFile = await this.filesService.uploadFile(
        file,
        'category',
        'category',
      );
      category.image = uploadedFile.data;
    }

    const updatedCategory = await this.categoryRepo.save(category);

    if (specifications && Array.isArray(specifications)) {
      await this.categorySpecification.removeAllSpecificationsFromCategory(
        updatedCategory.id,
      );
      for (const spec of specifications) {
        if (!spec.specificationId) {
          throw new BadRequestException(
            this.translate('category.error.specification_id_required', lang),
          );
        }
        await this.categorySpecification.addSpecificationToCategory(
          updatedCategory.id,
          spec.specificationId,
          spec.required ?? false,
        );
      }
    }

    if (attributes && Array.isArray(attributes)) {
      await this.categoryAttributeRepo.delete({
        category: { id: updatedCategory.id },
      });
      const relations: CategoryAttribute[] = [];
      for (const attr of attributes) {
        const attribute = await this.globalAttrRepo.findOne({
          where: { id: attr.attribute_id },
        });
        if (!attribute)
          throw new NotFoundException(
            this.translate('category.error.attribute_not_found', lang, {
              id: attr.attribute_id,
            }),
          );
        const relation = this.categoryAttributeRepo.create({
          category: updatedCategory,
          attribute,
        });
        relations.push(relation);
      }
      await this.categoryAttributeRepo.save(relations);
    }

    const categoryWithRelations = await this.categoryRepo.findOne({
      where: { id: updatedCategory.id },
      relations: [
        'parent',
        'children',
        'specifications',
        'specifications.specification',
        'categoryAttributes',
        'categoryAttributes.attribute',
      ],
    });

    return {
      message: this.translate('category.success.update', lang),
      data: categoryWithRelations!,
    };
  }

  private async hasCircularDependency(
    categoryId: string,
    potentialParentId: string,
  ): Promise<boolean> {
    let currentParentId = potentialParentId;
    while (currentParentId) {
      if (currentParentId === categoryId) return true;
      const parent = await this.categoryRepo.findOne({
        where: { id: currentParentId },
        relations: ['parent'],
      });
      if (!parent || !parent.parent) break;
      currentParentId = parent.parent.id;
    }
    return false;
  }

  async findAll(type?: string, lang: string = 'fr'): Promise<CategoryEntity[]> {
    const queryBuilder = this.categoryRepo
      .createQueryBuilder('category')
      .leftJoinAndSelect('category.parent', 'parent')
      .leftJoinAndSelect('category.children', 'children')
      .leftJoinAndSelect('category.specifications', 'categorySpec')
      .leftJoinAndSelect('categorySpec.specification', 'specification')
      .leftJoinAndSelect('category.categoryAttributes', 'categoryAttribute')
      .leftJoinAndSelect('categoryAttribute.attribute', 'attribute');
    if (type) queryBuilder.where('category.type = :type', { type });
    return queryBuilder.getMany();
  }

  async findAllParent(type?: string, lang: string = 'fr'): Promise<CategoryEntity[]> {
    const queryBuilder = this.categoryRepo
      .createQueryBuilder('category')
      .leftJoinAndSelect('category.children', 'children')
      .leftJoinAndSelect('category.specifications', 'categorySpec')
      .leftJoinAndSelect('categorySpec.specification', 'specification')
      .leftJoinAndSelect('category.categoryAttributes', 'categoryAttribute')
      .leftJoinAndSelect('categoryAttribute.attribute', 'attribute')
      .where('category.parent IS NULL');
    if (type) queryBuilder.andWhere('category.type = :type', { type });
    queryBuilder.orderBy('category.createdAt', 'ASC');
    return queryBuilder.getMany();
  }

  async findOne(id: string, lang: string = 'fr'): Promise<CategoryEntity> {
    const category = await this.categoryRepo.findOne({
      where: { id },
      relations: [
        'parent',
        'children',
        'specifications',
        'specifications.specification',
        'categoryAttributes',
        'categoryAttributes.attribute',
      ],
    });
    if (!category) {
      throw new NotFoundException(
        this.translate('category.error.category_not_found_by_id', lang, { id }),
      );
    }
    return category;
  }

  async findByTypeCompany(type: string, lang: string = 'fr'): Promise<CategoryEntity[]> {
    const categories = await this.categoryRepo.find({
      where: { type },
      relations: [
        'parent',
        'children',
        'specifications',
        'specifications.specification',
        'categoryAttributes',
        'categoryAttributes.attribute',
      ],
    });
    if (!categories.length) {
      throw new NotFoundException(
        this.translate('category.error.no_categories_by_type', lang, { type }),
      );
    }
    return categories;
  }

  async findByParentId(parentId: string | null, lang: string = 'fr'): Promise<CategoryEntity[]> {
    const whereClause = parentId
      ? { parent: { id: parentId } }
      : { parent: IsNull() };
    const categories = await this.categoryRepo.find({
      where: whereClause,
      relations: [
        'parent',
        'children',
        'specifications',
        'specifications.specification',
        'categoryAttributes',
        'categoryAttributes.attribute',
      ],
    });
    if (!categories.length) {
      throw new NotFoundException(
        this.translate('category.error.no_categories_by_parent', lang, {
          parent: parentId ?? 'null',
        }),
      );
    }
    return categories.map((category) => ({
      ...category,
      numberOfChildren: category.children.length,
    }));
  }

  async remove(id: string, lang: string = 'fr'): Promise<{ data: string }> {
    const category = await this.findOne(id, lang);
    await this.categoryRepo.remove(category);
    return { data: `Category with id ${id} removed successfully` };
  }

  async getSpecificationsByCategoryId(categoryId: string, lang: string = 'fr') {
    const category = await this.categoryRepo.findOne({
      where: { id: categoryId },
    });
    if (!category) {
      throw new NotFoundException(
        this.translate('category.error.category_not_found_by_id', lang, {
          id: categoryId,
        }),
      );
    }

    const categorySpecs = await this.categorySpecificationRepo
      .createQueryBuilder('cs')
      .leftJoinAndSelect('cs.specification', 'spec')
      .where('cs.categoryId = :categoryId', { categoryId })
      .andWhere('spec.deleted = :deleted', { deleted: false })
      .orderBy('cs.displayOrder', 'ASC')
      .getMany();

    if (!categorySpecs.length) {
      return {
        message: this.translate('category.message.no_specifications', lang, {
          name: category.name,
        }),
        data: [],
      };
    }

    const data = categorySpecs.map((cs) => ({
      categorySpecificationId: cs.id,
      categoryId: cs.categoryId,
      specificationId: cs.specificationId,
      required: cs.required,
      displayOrder: cs.displayOrder,
      specification: cs.specification
        ? {
          id: cs.specification.id,
          key: cs.specification.key,
          label: cs.specification.label,
          type: cs.specification.type,
          unit: cs.specification.unit,
          options:
            typeof cs.specification.options === 'string'
              ? JSON.parse(cs.specification.options)
              : cs.specification.options || [],
        }
        : null,
    }));

    return {
      message: this.translate('category.message.specifications_retrieved', lang),
      data,
      count: data.length,
    };
  }

  async getAttributesByCategoryId(categoryId: string, lang: string = 'fr') {
    const category = await this.categoryRepo.findOne({
      where: { id: categoryId },
    });
    if (!category) {
      throw new NotFoundException(
        this.translate('category.error.category_not_found_by_id', lang, {
          id: categoryId,
        }),
      );
    }

    const categoryAttrs = await this.categoryAttributeRepo
      .createQueryBuilder('ca')
      .leftJoinAndSelect('ca.attribute', 'attr')
      .leftJoinAndSelect('ca.category', 'category')
      .where('ca.category_id = :categoryId', { categoryId })
      .orderBy('attr.name', 'ASC')
      .getMany();

    if (!categoryAttrs.length) {
      return {
        message: this.translate('category.message.no_attributes', lang, {
          name: category.name,
        }),
        data: [],
      };
    }

    const data = categoryAttrs.map((ca) => ({
      categoryAttributeId: ca.id,
      categoryId: ca.category.id,
      attributeId: ca.attribute.id,
      attribute: {
        id: ca.attribute.id,
        name: ca.attribute.name,
        slug: ca.attribute.slug,
        type: ca.attribute.type,
        description: ca.attribute.description,
        isRequired: ca.attribute.isRequired,
        isFilterable: ca.attribute.isFilterable,
      },
      createdAt: ca.createdAt,
    }));

    return {
      message: this.translate('category.message.attributes_retrieved', lang, {
        name: category.name,
      }),
      data,
      count: data.length,
    };
  }

  async findAllWithProducts(companyId?: string, type?: string, lang: string = 'fr') {
    const queryBuilder = this.categoryRepo
      .createQueryBuilder('category')
      .leftJoinAndSelect('category.parent', 'parent')
      .leftJoinAndSelect('category.children', 'children')
      .leftJoinAndSelect('category.specifications', 'categorySpec')
      .leftJoinAndSelect('categorySpec.specification', 'specification')
      .leftJoinAndSelect('category.categoryAttributes', 'categoryAttribute')
      .leftJoinAndSelect('categoryAttribute.attribute', 'attribute')
      .leftJoinAndSelect(
        'category.products',
        'product',
        companyId ? 'product.companyId = :companyId' : undefined,
        companyId ? { companyId } : undefined,
      )
      .leftJoinAndSelect('product.images', 'images')
      .leftJoinAndSelect('product.measure', 'measure')
      .leftJoinAndSelect('product.category', 'productCategory')
      .leftJoinAndSelect('productCategory.parent', 'productCategoryParent')
      .leftJoinAndSelect('product.specificationValues', 'specificationValues')
      .leftJoinAndSelect('specificationValues.specification', 'specificationDetail')
      .leftJoinAndSelect('product.attributes', 'attributes')
      .leftJoinAndSelect('product.wishlist', 'wishlist')
      .leftJoinAndSelect('product.company', 'company')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('company.city', 'city');

    if (type) queryBuilder.andWhere('category.type = :type', { type });
    queryBuilder.orderBy('category.name', 'ASC');

    const categories = await queryBuilder.getMany();
    const categoriesWithProducts = categories.filter((c) => c.products && c.products.length > 0);

    return {
      message: categoriesWithProducts.length
        ? this.translate('category.message.categories_with_products', lang)
        : this.translate('category.message.no_categories_with_products', lang),
      data: categoriesWithProducts,
    };
  }

  async findAllWithProductsLimitTen(
    companyId?: string,
    type?: string,
    cityId?: string,
    countryId?: string,
    lang: string = 'fr',
  ) {
    // 1. Sous-requête pour trouver les IDs uniques des catégories ayant des produits
    const categoryIdsSubQuery = this.categoryRepo
      .createQueryBuilder('cat')
      .select('cat.id', 'id')
      .innerJoin('cat.products', 'prod')
      .leftJoin('prod.company', 'comp')
      .leftJoin('comp.city', 'city')
      .leftJoin('comp.country', 'country')
      .where('cat.deleted = false')
      .andWhere('cat.status = true')
      .andWhere('prod.status != :status', { status: 'DELETED' });

    if (type) {
      categoryIdsSubQuery.andWhere('cat.type = :type', { type });
    }
    if (companyId) {
      categoryIdsSubQuery.andWhere('comp.id = :companyId', { companyId });
    }
    if (cityId) {
      categoryIdsSubQuery.andWhere('city.id = :cityId', { cityId });
    }
    if (countryId) {
      categoryIdsSubQuery.andWhere('country.id = :countryId', { countryId });
    }

    // On extrait jusqu'à 10 IDs distincts de façon aléatoire
    const rawCategoryIds = await categoryIdsSubQuery
      .groupBy('cat.id')
      .orderBy('RAND()')
      .limit(10)
      .getRawMany();

    const matchedIds = rawCategoryIds.map((row) => row.id);

    if (matchedIds.length === 0) {
      return {
        message: this.translate('category.message.no_categories', lang),
        data: [],
      };
    }

    // 2. Chargement complet des 10 catégories sélectionnées avec leurs relations
    const categories = await this.categoryRepo
      .createQueryBuilder('category')
      .leftJoinAndSelect('category.parent', 'parent')
      .leftJoinAndSelect('category.children', 'children')
      .leftJoinAndSelect('category.specifications', 'categorySpec')
      .leftJoinAndSelect('categorySpec.specification', 'specification')
      .leftJoinAndSelect('category.categoryAttributes', 'categoryAttribute')
      .leftJoinAndSelect('categoryAttribute.attribute', 'attribute')
      .where('category.id IN (:...matchedIds)', { matchedIds })
      .getMany();

    // 3. Récupération des produits associés à ces catégories
    const productsQuery = this.productRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.images', 'images')
      .leftJoinAndSelect('product.measure', 'measure')
      .leftJoinAndSelect('product.specificationValues', 'specificationValues')
      .leftJoinAndSelect(
        'specificationValues.specification',
        'specificationDetail',
      )
      .leftJoinAndSelect('product.attributes', 'attributes')
      .leftJoinAndSelect('product.wishlist', 'wishlist')
      .leftJoinAndSelect('product.company', 'company')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('company.city', 'city')
      .where('category.id IN (:...matchedIds)', { matchedIds })
      .andWhere('product.status != :status', { status: 'DELETED' });

    if (companyId) {
      productsQuery.andWhere('company.id = :companyId', { companyId });
    }
    if (cityId) {
      productsQuery.andWhere('city.id = :cityId', { cityId });
    }
    if (countryId) {
      productsQuery.andWhere('country.id = :countryId', { countryId });
    }

    const products = await productsQuery.orderBy('RAND()').getMany();

    // 4. Regroupement (10 produits max par catégorie)
    const productsByCategory: Record<string, Product[]> = {};
    for (const product of products) {
      const categoryId = product.category?.id;
      if (!categoryId) continue;
      if (!productsByCategory[categoryId]) productsByCategory[categoryId] = [];
      if (productsByCategory[categoryId].length < 10) {
        productsByCategory[categoryId].push(product);
      }
    }

    // 5. Assemblage final
    const categoriesWithProducts = categories
      .map((category) => ({
        ...category,
        products: productsByCategory[category.id] || [],
      }))
      .filter((category) => category.products.length > 0);

    return {
      message: categoriesWithProducts.length
        ? this.translate('category.message.categories_with_products', lang)
        : this.translate(
          'category.message.no_categories_with_products',
          lang,
        ),
      data: categoriesWithProducts,
    };
  }

  async deleteCategory(id: string, lang: string = 'fr'): Promise<{ message: string; data: CategoryEntity }> {
    const category = await this.categoryRepo.findOne({
      where: { id },
      relations: [
        'parent',
        'children',
        'specifications',
        'specifications.specification',
        'categoryAttributes',
        'categoryAttributes.attribute',
        'products',
        'providers',
      ],
    });
    if (!category) {
      throw new NotFoundException(
        this.translate('category.error.category_not_found_by_id', lang, { id }),
      );
    }
    category.deleted = true;
    await this.categoryRepo.save(category);
    return {
      message: this.translate('category.success.delete', lang),
      data: category,
    };
  }
}