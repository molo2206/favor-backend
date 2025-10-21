import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CategoryEntity } from './entities/category.entity';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { slugify } from 'src/users/utility/slug/slugify';
import { CloudinaryService } from 'src/users/utility/helpers/cloudinary.service';
import { In } from 'typeorm';
import { CategorySpecification } from 'src/specification/entities/CategorySpecification.entity';
import { CategorySpecificationService } from 'src/specification/category-specification.service';

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(CategoryEntity)
    private readonly categoryRepo: Repository<CategoryEntity>,

    @InjectRepository(CategorySpecification)
    private readonly categorySpecificationRepo: Repository<CategorySpecification>,

    private readonly categorySpecification: CategorySpecificationService,

    private readonly cloudinary: CloudinaryService,
  ) {}

  async create(
    createCategoryDto: CreateCategoryDto,
    file: Express.Multer.File,
  ): Promise<{ message: string; data: CategoryEntity }> {
    const { name, parentId, type, color, specifications } = createCategoryDto;

    const existingCategory = await this.categoryRepo.findOne({ where: { name, type } });
    if (existingCategory) {
      throw new ConflictException('Une catégorie avec ce nom et ce type existe déjà');
    }

    let parent: CategoryEntity | undefined = undefined;
    if (parentId) {
      const foundParent = await this.categoryRepo.findOne({ where: { id: parentId } });
      if (!foundParent) throw new NotFoundException('Catégorie parente non trouvée');
      parent = foundParent;
    }

    const slug = slugify(name, { lower: true, strict: true });

    if (!file) throw new BadRequestException('Une image est requise pour créer une catégorie.');
    const imageUrl = await this.cloudinary.handleUploadImage(file, 'category');

    const category = this.categoryRepo.create({
      name,
      slug,
      type,
      color,
      parent,
      image: imageUrl,
    });

    const savedCategory = await this.categoryRepo.save(category);

    // Lier les spécifications si elles existent
    if (specifications && Array.isArray(specifications)) {
      for (const spec of specifications) {
        await this.categorySpecification.addSpecificationToCategory(
          savedCategory.id,
          spec.specificationId,
          spec.required || false,
        );
      }
    }

    const categoryWithRelations = await this.categoryRepo.findOne({
      where: { id: savedCategory.id },
      relations: ['parent', 'children', 'specifications', 'specifications.specification'],
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

    const { name, parentId, type, color, specifications } = updateCategoryDto;

    // ✅ Vérifier unicité nom + type
    if (name && type) {
      const existingCategory = await this.categoryRepo.findOne({
        where: { name, type },
      });
      if (existingCategory && existingCategory.id !== id) {
        throw new ConflictException('Une catégorie avec ce nom et ce type existe déjà');
      }
    }

    // ✅ Mise à jour des champs de base
    if (name) {
      category.name = name;
      category.slug = slugify(name, { lower: true, strict: true });
    }
    if (type) category.type = type;
    if (color) category.color = color;

    if (parentId) {
      const parent = await this.categoryRepo.findOne({ where: { id: parentId } });
      if (!parent) throw new NotFoundException('Catégorie parente non trouvée');
      category.parent = parent;
    }

    // ✅ Image
    if (file) {
      const imageUrl = await this.cloudinary.handleUploadImage(file, 'category');
      category.image = imageUrl;
    }

    // ✅ Sauvegarder la catégorie
    const updatedCategory = await this.categoryRepo.save(category);

    if (specifications && Array.isArray(specifications)) {
      // Supprimer toutes les anciennes spécifications pour cette catégorie
      await this.categorySpecification.removeAllSpecificationsFromCategory(updatedCategory.id);

      // Ajouter ou mettre à jour les nouvelles spécifications
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

    // ✅ Charger les relations pour la réponse
    const categoryWithRelations = await this.categoryRepo.findOne({
      where: { id: updatedCategory.id },
      relations: ['parent', 'children', 'specifications', 'specifications.specification'],
    });

    return {
      message: 'Catégorie mise à jour avec succès',
      data: categoryWithRelations!,
    };
  }

  async findAll(type?: string): Promise<CategoryEntity[]> {
    const queryBuilder = this.categoryRepo
      .createQueryBuilder('category')
      .leftJoinAndSelect('category.parent', 'parent')
      .leftJoinAndSelect('category.children', 'children')
      .leftJoinAndSelect('category.specifications', 'categorySpec') // relation CategorySpecification
      .leftJoinAndSelect('categorySpec.specification', 'specification'); // récupérer les détails de la spécification

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
      .where('category.parent IS NULL');

    if (type) {
      queryBuilder.andWhere('category.type = :type', { type });
    }

    const categories = await queryBuilder.getMany();
    return categories;
  }

  async findOne(id: string): Promise<CategoryEntity> {
    const category = await this.categoryRepo.findOne({
      where: { id },
      relations: ['parent', 'children', 'specifications', 'specifications.specification'],
    });

    if (!category) {
      throw new NotFoundException(`Catégorie introuvable avec l'id: ${id}`);
    }

    return category;
  }

  async findByTypeCompany(type: string): Promise<CategoryEntity[]> {
    const categories = await this.categoryRepo.find({
      where: { type },
      relations: ['parent', 'children', 'specifications', 'specifications.specification'],
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
      relations: ['children', 'specifications', 'specifications.specification'],
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
      .leftJoinAndSelect('cs.specification', 'spec') // Utiliser leftJoinAndSelect au lieu de innerJoinAndSelect
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
            options: cs.specification.options,
          }
        : null,
    }));

    return {
      message: `Spécifications récupérées avec succès`,
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
      .leftJoinAndSelect('category.products', 'product', 'product.companyId = :companyId', {
        companyId,
      }) // join avec filtre companyId
      .leftJoinAndSelect('product.images', 'images');

    if (type) {
      queryBuilder.andWhere('category.type = :type', { type });
    }

    queryBuilder.orderBy('category.name', 'ASC');

    const categories = await queryBuilder.getMany();

    // Supprimer les catégories sans produit
    const categoriesWithProducts = categories.filter((c) => c.products?.length);

    return {
      message: categoriesWithProducts.length
        ? 'Catégories avec produits récupérées avec succès.'
        : 'Aucune catégorie avec produit trouvé.',
      data: categoriesWithProducts,
    };
  }
}
