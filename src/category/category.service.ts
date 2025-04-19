import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CategoryEntity } from './entities/category.entity';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { slugify } from 'src/users/utility/slug/slugify';
import { CloudinaryService } from 'src/users/utility/helpers/cloudinary.service';

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(CategoryEntity)
    private readonly categoryRepo: Repository<CategoryEntity>,
    private readonly cloudinary: CloudinaryService
  ) { }

  async create(createCategoryDto: CreateCategoryDto, file: Express.Multer.File): Promise<CategoryEntity> {
    const { name, parentId, type } = createCategoryDto;

    // Vérification si la catégorie existe déjà
    const existingCategory = await this.categoryRepo.findOne({ where: { name } });
    if (existingCategory) {
      throw new ConflictException('Une catégorie avec ce nom existe déjà');
    }

    let parent: CategoryEntity | undefined = undefined;

    if (parentId) {
      // Vérification si la catégorie parente existe
      const foundParent = await this.categoryRepo.findOne({ where: { id: parentId } });
      if (!foundParent) {
        throw new NotFoundException('Catégorie parente non trouvée');
      }
      parent = foundParent;
    }

    // Slugification du nom pour créer un slug unique
    const slug = slugify(name);

    // Upload de l'image via Cloudinary si elle existe
    let imageUrl: string | undefined = undefined;
    if (file) {
      imageUrl = await this.cloudinary.handleUploadImage(file, 'category');
    }

    // Création de la catégorie
    const category = this.categoryRepo.create({
      name,
      slug,
      type,
      parent,
      image: imageUrl,
    });

    // Sauvegarde et retour de la catégorie
    return await this.categoryRepo.save(category);
  }


  async update(
    id: string,
    updateCategoryDto: UpdateCategoryDto,
    file?: Express.Multer.File,
  ): Promise<CategoryEntity> {
    if (!updateCategoryDto && !file) {
      throw new NotFoundException('Aucune donnée fournie pour la mise à jour');
    }
  
    // Récupération de la catégorie à mettre à jour
    const category = await this.categoryRepo.findOne({ where: { id } });
  
    if (!category) {
      throw new NotFoundException('Catégorie introuvable');
    }
  
    const { name, parentId, type } = updateCategoryDto;
  
    // Mise à jour du nom et génération du slug automatique
    if (name) {
      category.name = name;
      category.slug = slugify(name);
    }
  
    // Mise à jour du type si fourni
    if (type) {
      category.type = type;
    }
  
    // Mise à jour de la catégorie parente
    if (parentId) {
      const parent = await this.categoryRepo.findOne({ where: { id: parentId } });
      if (!parent) {
        throw new NotFoundException('Catégorie parente non trouvée');
      }
      category.parent = parent;
    }
  
    // Mise à jour de l'image si un fichier est fourni
    if (file) {
      // Upload de l'image vers Cloudinary
      const imageUrl = await this.cloudinary.handleUploadImage(file, 'category');
      category.image = imageUrl; // Utilise l'URL d'image renvoyée par Cloudinary
    }
  
    // Sauvegarde de la catégorie mise à jour
    return this.categoryRepo.save(category);
  }
  


  async findAll(type?: string): Promise<CategoryEntity[]> {
    // Si le type est fourni, filtrer les catégories par type
    const queryBuilder = this.categoryRepo.createQueryBuilder('category')
      .leftJoinAndSelect('category.parent', 'parent')
      .leftJoinAndSelect('category.children', 'children');

    if (type) {
      queryBuilder.where('category.type = :type', { type });
    }

    return queryBuilder.getMany();
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

  async remove(id: string): Promise<void> {
    const category = await this.findOne(id);
    await this.categoryRepo.remove(category);
  }
}
