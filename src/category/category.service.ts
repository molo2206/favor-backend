import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CategoryEntity } from './entities/category.entity';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { slugify } from 'src/users/utility/slug/slugify';
import { CloudinaryService } from 'src/users/utility/helpers/cloudinary.service';
import { CategoryWithPagination } from 'src/users/interfaces/category';

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(CategoryEntity)
    private readonly categoryRepo: Repository<CategoryEntity>,
    private readonly cloudinary: CloudinaryService
  ) { }

  async create(createCategoryDto: CreateCategoryDto, file: Express.Multer.File): Promise<{ message: string, data: CategoryEntity }> {
    const { name, parentId, type } = createCategoryDto;

    const existingCategory = await this.categoryRepo.findOne({ where: { name, type } });
    if (existingCategory) {
      throw new ConflictException('Une catégorie avec ce nom et ce type existe déjà');
    }

    let parent: CategoryEntity | undefined = undefined;

    if (parentId) {
      const foundParent = await this.categoryRepo.findOne({ where: { id: parentId } });

      if (!foundParent) {
        throw new NotFoundException('Catégorie parente non trouvée');
      }

      parent = foundParent;
    }

    const slug = slugify(name);

    // Vérification : image obligatoire
    if (!file) {
      throw new BadRequestException('Une image est requise pour créer une catégorie.');
    }

    const imageUrl = await this.cloudinary.handleUploadImage(file, 'category');

    const category = this.categoryRepo.create({
      name,
      slug,
      type,
      parent,
      image: imageUrl,
    });

    const savedCategory = await this.categoryRepo.save(category);
    return { message: 'Catégorie enregistrée avec succès', data: savedCategory };
  }

  async update(
    id: string,
    updateCategoryDto: UpdateCategoryDto,
    file?: Express.Multer.File
  ): Promise<{ message: string; data: CategoryEntity }> { // <- attention ici
    const category = await this.categoryRepo.findOne({ where: { id } });

    if (!category) {
      throw new NotFoundException('Catégorie introuvable');
    }

    const { name, parentId, type } = updateCategoryDto;

    const existingCategory = await this.categoryRepo.findOne({
      where: { name, type },
    });

    if (existingCategory && existingCategory.id !== id) {  // pour éviter de se bloquer soi-même
      throw new ConflictException('Une catégorie avec ce nom et ce type existe déjà');
    }

    if (name) {
      category.name = name;
      category.slug = slugify(name);
    }

    if (type) {
      category.type = type;
    }

    if (parentId) {
      const parent = await this.categoryRepo.findOne({ where: { id: parentId } });
      if (!parent) {
        throw new NotFoundException('Catégorie parente non trouvée');
      }
      category.parent = parent;
    }

    if (file) {
      const imageUrl = await this.cloudinary.handleUploadImage(file, 'category');
      category.image = imageUrl;
    }

    const updatedCategory = await this.categoryRepo.save(category);

    return {
      message: 'Catégorie mise à jour avec succès',
      data: updatedCategory,
    };
  }

  async findAll(type?: string): Promise<CategoryEntity[]> {
    const queryBuilder = this.categoryRepo.createQueryBuilder('category')
      .leftJoinAndSelect('category.parent', 'parent')
      .leftJoinAndSelect('category.children', 'children');

    if (type) {
      queryBuilder.where('category.type = :type', { type });
    }
    const categories = await queryBuilder.getMany();
    return categories;
  }

  async findOne(id: string): Promise<CategoryEntity> {
    const category = await this.categoryRepo.findOne({
      where: { id },
      relations: ['parent', 'children'],
    });

    if (!category) {
      throw new NotFoundException(`Catégorie introuvable avec l'id: ${id}`);
    }

    return category;
  }

  async findByTypeCompany(type: string): Promise<CategoryEntity[]> {
    const categories = await this.categoryRepo.find({
      where: { type: type },
      relations: ['parent', 'children'],
    });

    if (!categories.length) {
      throw new NotFoundException(`Aucune catégorie trouvée pour le type d’entreprise avec l'id: ${type}`);
    }

    return categories;
  }

  async findByParentId(
    parentId: string | null,
    options?: { page?: number; limit?: number }
  ): Promise<CategoryWithPagination> {
    const { page = 1, limit = 10 } = options || {};

    const whereClause = parentId
      ? { parent: { id: parentId } }
      : { parent: IsNull() };

    // Effectuer la recherche des catégories avec pagination
    const [categories, total] = await this.categoryRepo.findAndCount({
      where: whereClause,
      relations: ['children'],
      take: limit, // Limiter le nombre de catégories récupérées
      skip: (page - 1) * limit, // Décaler les résultats selon la page
    });

    if (!categories.length) {
      throw new NotFoundException(
        `Aucune catégorie trouvée avec le parent "${parentId ?? 'null'}"`
      );
    }

    // Enrichir les catégories : ajouter le nombre d'enfants pour chaque catégorie
    const enrichedCategories = categories.map(category => ({
      ...category,
      numberOfChildren: category.children.length,
    }));

    // Retourner les catégories enrichies avec les informations de pagination
    return {
      categories: enrichedCategories,
      pagination: {
        totalItems: total,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        itemsPerPage: limit,
      },
    };
  }

  async remove(id: string): Promise<{ data: string }> {
    // Récupère la catégorie à supprimer
    const category = await this.findOne(id);

    // Supprimer directement l'entité
    await this.categoryRepo.remove(category);

    return { data: `Category with id ${id} removed successfully` };
  }
}
