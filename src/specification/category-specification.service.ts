import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CategorySpecification } from './entities/CategorySpecification.entity';
import { Specification } from './entities/Specification.entity';
import { CategoryEntity } from 'src/category/entities/category.entity';

@Injectable()
export class CategorySpecificationService {
  constructor(
    @InjectRepository(CategorySpecification)
    private catSpecRepo: Repository<CategorySpecification>,
    @InjectRepository(Specification)
    private specRepo: Repository<Specification>,
    @InjectRepository(CategoryEntity)
    private categoryRepo: Repository<CategoryEntity>,
  ) {}

  // Ajouter une spécification à une catégorie
  async addSpecificationToCategory(categoryId: string, specificationId: string, required = false, displayOrder = 0) {
    const category = await this.categoryRepo.findOne({ where: { id: categoryId } });
    if (!category) throw new NotFoundException(`Catégorie ${categoryId} introuvable`);

    const specification = await this.specRepo.findOne({ where: { id: specificationId } });
    if (!specification) throw new NotFoundException(`Spécification ${specificationId} introuvable`);

    const catSpec = this.catSpecRepo.create({ categoryId, specificationId, required, displayOrder });
    await this.catSpecRepo.save(catSpec);

    return { message: 'Spécification ajoutée à la catégorie avec succès', data: catSpec };
  }

  // Récupérer toutes les spécifications d'une catégorie
  async findByCategory(categoryId: string) {
    const catSpecs = await this.catSpecRepo.find({
      where: { categoryId },
      relations: ['specification'],
      order: { displayOrder: 'ASC' },
    });

    return {
      message: `Spécifications de la catégorie ${categoryId} récupérées`,
      data: catSpecs.map(cs => cs.specification),
    };
  }

  // Supprimer une spécification d'une catégorie
  async removeSpecificationFromCategory(categoryId: string, specificationId: string) {
    const catSpec = await this.catSpecRepo.findOne({ where: { categoryId, specificationId } });
    if (!catSpec) throw new NotFoundException('Spécification non trouvée pour cette catégorie');

    await this.catSpecRepo.remove(catSpec);
    return { message: 'Spécification supprimée de la catégorie avec succès', data: null };
  }
}
