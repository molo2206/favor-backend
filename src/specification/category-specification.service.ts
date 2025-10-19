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

  /**
   * ✅ Ajouter ou mettre à jour une spécification pour une catégorie (Upsert)
   */
  async addSpecificationToCategory(
    categoryId: string,
    specificationId: string,
    required = false,
    displayOrder = 0,
  ) {
    // Vérifier que la catégorie existe
    const category = await this.categoryRepo.findOne({ where: { id: categoryId } });
    if (!category) throw new NotFoundException(`Catégorie ${categoryId} introuvable`);

    // Vérifier que la spécification existe
    const specification = await this.specRepo.findOne({ where: { id: specificationId } });
    if (!specification) throw new NotFoundException(`Spécification ${specificationId} introuvable`);

    // Vérifier si une liaison existe déjà
    let catSpec = await this.catSpecRepo.findOne({
      where: { categoryId, specificationId },
    });

    if (catSpec) {
      // 👉 Mettre à jour si elle existe
      catSpec.required = required;
      catSpec.displayOrder = displayOrder;
    } else {
      // 👉 Créer si elle n'existe pas
      catSpec = this.catSpecRepo.create({
        categoryId,
        specificationId,
        required,
        displayOrder,
      });
    }

    // Sauvegarder (insert ou update selon le cas)
    await this.catSpecRepo.save(catSpec);

    return {
      message: 'Spécification ajoutée ou mise à jour avec succès pour la catégorie',
      data: catSpec,
    };
  }

  /**
   * Récupérer toutes les spécifications d'une catégorie
   */
  async findByCategory(categoryId: string) {
    const catSpecs = await this.catSpecRepo.find({
      where: { categoryId },
      relations: ['specification'],
      order: { displayOrder: 'ASC' },
    });

    return {
      message: `Spécifications de la catégorie ${categoryId} récupérées`,
      data: catSpecs.map((cs) => cs.specification),
    };
  }

  /**
   * Supprimer une spécification d'une catégorie
   */
  async removeSpecificationFromCategory(categoryId: string) {
    const catSpec = await this.catSpecRepo.findOne({ where: { categoryId} });
    if (!catSpec) throw new NotFoundException('Spécification non trouvée pour cette catégorie');

    await this.catSpecRepo.remove(catSpec);
    return { message: 'Spécification supprimée de la catégorie avec succès', data: null };
  }
}
