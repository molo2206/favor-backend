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
import { In } from 'typeorm';
import { CategorySpecification } from 'src/specification/entities/CategorySpecification.entity';
import { CategorySpecificationService } from 'src/specification/category-specification.service';
import { CategoryAttribute } from 'src/AttributGlobal/entities/category_attributes.entity';
import { Attribute } from 'src/AttributGlobal/entities/attributes.entity';

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
  ) {}

  async create(
    createCategoryDto: CreateCategoryDto,
    file: Express.Multer.File,
  ): Promise<{ message: string; data: CategoryEntity }> {
    const { name, parentId, type, color, specifications, attributes } = createCategoryDto;

    // 🔹 Vérification du nom de catégorie selon le parentId
    if (parentId) {
      // Si parentId est disponible, vérifie dans les sous-catégories de ce parent
      const existingSubCategory = await this.categoryRepo.findOne({
        where: {
          name,
          type,
          parent: { id: parentId }, // Vérifie spécifiquement dans les enfants de ce parent
        },
      });
      if (existingSubCategory) {
        throw new ConflictException(
          'Une sous-catégorie avec ce nom existe déjà dans cette catégorie parente',
        );
      }
    } else {
      // Si parentId est absent, vérifie dans les catégories principales (sans parent)
      const existingMainCategory = await this.categoryRepo.findOne({
        where: {
          name,
          type,
          parent: IsNull(), // Vérifie uniquement les catégories sans parent
        },
      });
      if (existingMainCategory) {
        throw new ConflictException(
          'Une catégorie principale avec ce nom et ce type existe déjà',
        );
      }
    }

    // 🔹 Vérifie la catégorie parente
    let parent: CategoryEntity | undefined = undefined;
    if (parentId) {
      const foundParent = await this.categoryRepo.findOne({
        where: { id: parentId },
        relations: ['children'], // Optionnel: pour charger les enfants si besoin
      });
      if (!foundParent) throw new NotFoundException('Catégorie parente non trouvée');

      // Optionnel: Vérifier que la catégorie parente a le même type
      if (foundParent.type !== type) {
        throw new BadRequestException(
          'La catégorie parente doit avoir le même type que la catégorie créée',
        );
      }

      parent = foundParent;
    }

    // 🔹 Génère un slug unique
    let slug = slugify(name, { lower: true, strict: true });
    const existingSlug = await this.categoryRepo.findOne({ where: { slug } });
    if (existingSlug) {
      const uniqueSuffix = Date.now().toString().slice(-5);
      slug = `${slug}-${uniqueSuffix}`;
    }

    // 🔹 Vérifie la présence du fichier image
    if (!file) throw new BadRequestException('Une image est requise pour créer une catégorie.');
    const imageUrl = await this.cloudinary.handleUploadImage(file, 'category');

    // 🔹 Crée la catégorie
    const category = this.categoryRepo.create({
      name,
      slug,
      type,
      color,
      parent: parent ?? undefined,
      image: imageUrl,
    });

    const savedCategory = await this.categoryRepo.save(category);

    // 🔹 Lier les spécifications
    if (specifications && Array.isArray(specifications)) {
      for (const spec of specifications) {
        await this.categorySpecification.addSpecificationToCategory(
          savedCategory.id,
          spec.specificationId,
          spec.required || false,
        );
      }
    }

    // 🔹 Lier les attributs globaux
    if (attributes && Array.isArray(attributes)) {
      const relations: CategoryAttribute[] = [];
      for (const attr of attributes) {
        const attribute = await this.globalAttrRepo.findOne({
          where: { id: attr.attribute_id },
        });
        if (!attribute)
          throw new NotFoundException(`Attribut ${attr.attribute_id} introuvable`);

        const relation = this.categoryAttributeRepo.create({
          category: { id: savedCategory.id },
          attribute,
        });
        relations.push(relation);
      }
      await this.categoryAttributeRepo.save(relations);
    }

    // 🔹 Charger toutes les relations pour le retour
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
      message: 'Catégorie enregistrée avec succès',
      data: categoryWithRelations!,
    };
  }
  async update(
    id: string,
    updateCategoryDto: UpdateCategoryDto,
    file?: Express.Multer.File,
  ): Promise<{ message: string; data: CategoryEntity }> {
    const category = await this.categoryRepo.findOne({ where: { id } });
    if (!category) throw new NotFoundException('Catégorie introuvable');

    const { name, parentId, type, color, specifications, attributes } = updateCategoryDto;

    // 🔹 Vérification du nom de catégorie selon le parentId
    if (name) {
      const targetParentId = parentId !== undefined ? parentId : category.parent?.id;

      if (targetParentId) {
        // Si parentId est disponible, vérifie dans les sous-catégories de ce parent
        const existingSubCategory = await this.categoryRepo.findOne({
          where: {
            name,
            type: type || category.type,
            parent: { id: targetParentId },
            id: Not(id), // Exclut la catégorie actuelle
          },
        });
        if (existingSubCategory) {
          throw new ConflictException(
            'Une sous-catégorie avec ce nom existe déjà dans cette catégorie parente',
          );
        }
      } else {
        // Si pas de parent, vérifie dans les catégories principales
        const existingMainCategory = await this.categoryRepo.findOne({
          where: {
            name,
            type: type || category.type,
            parent: IsNull(),
            id: Not(id), // Exclut la catégorie actuelle
          },
        });
        if (existingMainCategory) {
          throw new ConflictException(
            'Une catégorie principale avec ce nom et ce type existe déjà',
          );
        }
      }
    }

    // 🔹 Vérifier la cohérence du type avec le parent
    if (type && category.parent && category.parent.type !== type) {
      throw new BadRequestException(
        'Le type de la catégorie doit correspondre au type de la catégorie parente',
      );
    }

    // 🔹 Mise à jour des champs de base
    if (name) {
      category.name = name;
      category.slug = slugify(name, { lower: true, strict: true });
    }
    if (type) category.type = type;
    if (color) category.color = color;

    // 🔹 Gestion du parent
    if (parentId !== undefined) {
      if (parentId === null) {
        // Supprimer le parent (devenir catégorie principale)
        category.parent = null;
      } else {
        // Vérifier et assigner le nouveau parent
        const parent = await this.categoryRepo.findOne({
          where: { id: parentId },
          relations: ['children'],
        });
        if (!parent) throw new NotFoundException('Catégorie parente non trouvée');

        // Empêcher une catégorie d'être son propre parent
        if (parentId === id) {
          throw new BadRequestException('Une catégorie ne peut pas être son propre parent');
        }

        // Vérifier la circularité (empêcher les boucles infinies)
        if (await this.hasCircularDependency(id, parentId)) {
          throw new BadRequestException(
            'Impossible de définir ce parent : dépendance circulaire détectée',
          );
        }

        // Vérifier que le type correspond
        if (type && parent.type !== type) {
          throw new BadRequestException(
            'Le type de la catégorie doit correspondre au type de la catégorie parente',
          );
        }

        category.parent = parent;
      }
    }

    // 🔹 Image
    if (file) {
      const imageUrl = await this.cloudinary.handleUploadImage(file, 'category');
      category.image = imageUrl;
    }

    // 🔹 Sauvegarder la catégorie
    const updatedCategory = await this.categoryRepo.save(category);

    // 🔹 Gestion des specifications
    if (specifications && Array.isArray(specifications)) {
      await this.categorySpecification.removeAllSpecificationsFromCategory(updatedCategory.id);

      for (const spec of specifications) {
        if (!spec.specificationId) {
          throw new BadRequestException(
            'Chaque specification doit contenir un specificationId',
          );
        }
        await this.categorySpecification.addSpecificationToCategory(
          updatedCategory.id,
          spec.specificationId,
          spec.required ?? false,
        );
      }
    }

    // 🔹 Gestion des attributes
    if (attributes && Array.isArray(attributes)) {
      // Supprimer les anciennes relations si existantes
      await this.categoryAttributeRepo.delete({ category: { id: updatedCategory.id } });

      const relations: CategoryAttribute[] = [];
      for (const attr of attributes) {
        const attribute = await this.globalAttrRepo.findOne({
          where: { id: attr.attribute_id },
        });
        if (!attribute)
          throw new NotFoundException(`Attribut ${attr.attribute_id} introuvable`);

        const relation = this.categoryAttributeRepo.create({
          category: updatedCategory,
          attribute,
        });
        relations.push(relation);
      }
      await this.categoryAttributeRepo.save(relations);
    }

    // 🔹 Charger toutes les relations pour la réponse
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
      message: 'Catégorie mise à jour avec succès',
      data: categoryWithRelations!,
    };
  }

  // 🔹 Méthode helper pour détecter les dépendances circulaires
  private async hasCircularDependency(
    categoryId: string,
    potentialParentId: string,
  ): Promise<boolean> {
    let currentParentId = potentialParentId;

    while (currentParentId) {
      if (currentParentId === categoryId) {
        return true; // Dépendance circulaire détectée
      }

      const parent = await this.categoryRepo.findOne({
        where: { id: currentParentId },
        relations: ['parent'],
      });

      if (!parent || !parent.parent) {
        break; // Pas de parent supplémentaire
      }

      currentParentId = parent.parent.id;
    }

    return false;
  }

  async findAll(type?: string): Promise<CategoryEntity[]> {
    const queryBuilder = this.categoryRepo
      .createQueryBuilder('category')
      .leftJoinAndSelect('category.parent', 'parent')
      .leftJoinAndSelect('category.children', 'children')
      .leftJoinAndSelect('category.specifications', 'categorySpec')
      .leftJoinAndSelect('categorySpec.specification', 'specification')
      .leftJoinAndSelect('category.categoryAttributes', 'categoryAttribute')
      .leftJoinAndSelect('categoryAttribute.attribute', 'attribute'); // attribut global

    if (type) {
      queryBuilder.where('category.type = :type', { type });
    }

    const categories = await queryBuilder.getMany();
    return categories;
  }

  async findAllParent(type?: string): Promise<CategoryEntity[]> {
    const queryBuilder = this.categoryRepo
      .createQueryBuilder('category')
      .leftJoinAndSelect('category.children', 'children')
      .leftJoinAndSelect('category.specifications', 'categorySpec')
      .leftJoinAndSelect('categorySpec.specification', 'specification')
      .leftJoinAndSelect('category.categoryAttributes', 'categoryAttribute')
      .leftJoinAndSelect('categoryAttribute.attribute', 'attribute')
      .where('category.parent IS NULL');

    if (type) {
      queryBuilder.andWhere('category.type = :type', { type });
    }

    queryBuilder.orderBy('category.createdAt', 'ASC');

    const categories = await queryBuilder.getMany();
    return categories;
  }

  async findOne(id: string): Promise<CategoryEntity> {
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
      throw new NotFoundException(`Catégorie introuvable avec l'id: ${id}`);
    }

    return category;
  }

  async findByTypeCompany(type: string): Promise<CategoryEntity[]> {
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
        `Aucune catégorie trouvée pour le type d’entreprise avec l'id: ${type}`,
      );
    }

    return categories;
  }

  async findByParentId(parentId: string | null): Promise<CategoryEntity[]> {
    const whereClause = parentId ? { parent: { id: parentId } } : { parent: IsNull() };

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
        `Aucune catégorie trouvée avec le parent "${parentId ?? 'null'}"`,
      );
    }

    return categories.map((category) => ({
      ...category,
      numberOfChildren: category.children.length,
    }));
  }

  async remove(id: string): Promise<{ data: string }> {
    // Récupère la catégorie à supprimer
    const category = await this.findOne(id);

    // Supprimer directement l'entité
    await this.categoryRepo.remove(category);

    return { data: `Category with id ${id} removed successfully` };
  }

  async getSpecificationsByCategoryId(categoryId: string) {
    const category = await this.categoryRepo.findOne({
      where: { id: categoryId },
    });

    if (!category) {
      throw new NotFoundException(`Catégorie avec l'ID ${categoryId} non trouvée`);
    }

    // Utiliser Query Builder avec le bon nom de relation
    const categorySpecs = await this.categorySpecificationRepo
      .createQueryBuilder('cs')
      .leftJoinAndSelect('cs.specification', 'spec')
      .where('cs.categoryId = :categoryId', { categoryId })
      .andWhere('spec.deleted = :deleted', { deleted: false })
      .orderBy('cs.displayOrder', 'ASC')
      .getMany();

    if (!categorySpecs.length) {
      return {
        message: `Aucune spécification trouvée pour la catégorie "${category.name}"`,
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
            // 🔹 s'assurer que options est un tableau
            options:
              typeof cs.specification.options === 'string'
                ? JSON.parse(cs.specification.options)
                : cs.specification.options || [],
          }
        : null,
    }));

    return {
      message: `Spécifications récupérées avec succès`,
      data,
      count: data.length,
    };
  }

  async getAttributesByCategoryId(categoryId: string) {
    // Vérifie si la catégorie existe
    const category = await this.categoryRepo.findOne({ where: { id: categoryId } });
    if (!category) {
      throw new NotFoundException(`Catégorie avec l'ID ${categoryId} non trouvée`);
    }

    // Récupère les attributs liés à la catégorie avec jointure sur la catégorie et l'attribut
    const categoryAttrs = await this.categoryAttributeRepo
      .createQueryBuilder('ca')
      .leftJoinAndSelect('ca.attribute', 'attr') // jointure pour les attributs
      .leftJoinAndSelect('ca.category', 'category') // jointure pour la catégorie
      .where('ca.category_id = :categoryId', { categoryId }) // utilise le nom correct de la colonne
      .orderBy('attr.name', 'ASC') // ✅ Utiliser 'name' au lieu de 'label'
      .getMany();

    if (!categoryAttrs.length) {
      return {
        message: `Aucun attribut trouvé pour la catégorie "${category.name}"`,
        data: [],
      };
    }

    // Transforme les résultats pour la réponse - CORRIGÉ selon l'entité Attribute
    const data = categoryAttrs.map((ca) => ({
      categoryAttributeId: ca.id,
      categoryId: ca.category.id, // récupéré via la jointure
      attributeId: ca.attribute.id,
      attribute: {
        id: ca.attribute.id,
        name: ca.attribute.name, // ✅ Utiliser 'name' au lieu de 'key' et 'label'
        slug: ca.attribute.slug, // ✅ Propriété existante
        type: ca.attribute.type, // ✅ Propriété existante
        description: ca.attribute.description, // ✅ Propriété existante
        isRequired: ca.attribute.isRequired, // ✅ Propriété existante
        isFilterable: ca.attribute.isFilterable, // ✅ Propriété existante
      },
      createdAt: ca.createdAt,
    }));

    return {
      message: `Attributs récupérés avec succès pour la catégorie "${category.name}"`,
      data,
      count: data.length,
    };
  }

  async findAllWithProducts(companyId: string, type?: string) {
    const queryBuilder = this.categoryRepo
      .createQueryBuilder('category')
      .leftJoinAndSelect('category.parent', 'parent')
      .leftJoinAndSelect('category.children', 'children')
      .leftJoinAndSelect('category.specifications', 'categorySpec')
      .leftJoinAndSelect('categorySpec.specification', 'specification')
      .leftJoinAndSelect('category.categoryAttributes', 'categoryAttribute')
      .leftJoinAndSelect('categoryAttribute.attribute', 'attribute')
      // join avec produits filtrés par companyId
      .leftJoinAndSelect('category.products', 'product', 'product.companyId = :companyId', {
        companyId,
      })
      // toutes les relations du produit
      .leftJoinAndSelect('product.images', 'images')
      .leftJoinAndSelect('product.measure', 'measure')
      .leftJoinAndSelect('product.rentalContracts', 'rentalContracts')
      .leftJoinAndSelect('product.saleTransactions', 'saleTransactions')
      .leftJoinAndSelect('product.specificationValues', 'specificationValues')
      .leftJoinAndSelect('specificationValues.specification', 'specificationDetail') // si tu veux le détail
      .leftJoinAndSelect('product.attributes', 'attributes')
      .leftJoinAndSelect('product.wishlist', 'wishlist')
      .leftJoinAndSelect('product.company', 'company')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('company.city', 'city');

    if (type) {
      queryBuilder.andWhere('category.type = :type', { type });
    }

    queryBuilder.orderBy('category.name', 'ASC');

    const categories = await queryBuilder.getMany();

    // On ne garde que les catégories avec au moins un produit
    const categoriesWithProducts = categories.filter((c) => c.products?.length);

    return {
      message: categoriesWithProducts.length
        ? 'Catégories avec produits récupérées avec succès.'
        : 'Aucune catégorie avec produit trouvé.',
      data: categoriesWithProducts,
    };
  }

  async deleteCategory(id: string): Promise<{ message: string; data: CategoryEntity }> {
    // Récupérer la catégorie
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
      throw new NotFoundException(`Catégorie avec l'ID ${id} introuvable`);
    }

    // Soft delete : on marque deleted = true
    category.deleted = true;
    await this.categoryRepo.save(category);

    return {
      message: `Catégorie '${category.name}' supprimée avec succès.`,
      data: category,
    };
  }
}
