import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CategoryEntity } from './entities/category.entity';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { slugify } from 'src/users/utility/slug/slugify';
import path from 'path';

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(CategoryEntity)
    private readonly categoryRepo: Repository<CategoryEntity>,
  ) { }

  async create(
    createCategoryDto: CreateCategoryDto,
    file?: Express.Multer.File,
  ): Promise<CategoryEntity> {
    const { name, parentId, type } = createCategoryDto;

    // Vérifier si une catégorie avec le même nom existe déjà
    const existingCategory = await this.categoryRepo.findOne({ where: { name } });
    if (existingCategory) {
      throw new ConflictException('Une catégorie avec ce nom existe déjà');
    }

    let parent: CategoryEntity | undefined = undefined;

    if (parentId) {
      const found = await this.categoryRepo.findOne({ where: { id: parentId } });
      if (!found) {
        throw new NotFoundException('Catégorie parente non trouvée');
      }
      parent = found;
    }

    const slug = slugify(name);
    const image = file ? file.filename : undefined;

    const category = this.categoryRepo.create({
      name,
      slug,
      type,
      parent,
      image,
    });
    return this.categoryRepo.save(category);
  }

  async update(
    id: string,
    updateCategoryDto: UpdateCategoryDto,
    file?: Express.Multer.File,
  ): Promise<CategoryEntity> {
    if (!updateCategoryDto && !file) {
      throw new NotFoundException('Aucune donnée fournie pour la mise à jour');
    }

    const category = await this.categoryRepo.findOne({ where: { id } });

    if (!category) {
      throw new NotFoundException('Catégorie introuvable');
    }

    const { name, parentId, type } = updateCategoryDto;

    if (name) {
      category.name = name;
      category.slug = slugify(name); // si slug auto
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
      const fileName = path.basename(file.path);
      category.image = fileName;
    }

    return this.categoryRepo.save(category);
  }


  async findAll(): Promise<CategoryEntity[]> {
    return this.categoryRepo.find({
      relations: ['parent', 'children'],
    });
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
