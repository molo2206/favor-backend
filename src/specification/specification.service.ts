import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Specification } from './entities/Specification.entity';
import { CategorySpecification } from './entities/CategorySpecification.entity';
import { ProductSpecificationValue } from './entities/ProductSpecificationValue.entity';
import { CreateSpecificationDto } from './dto/create-specification.dto';
import { UpdateSpecificationDto } from './dto/update-specification.dto';

@Injectable()
export class SpecificationService {
  constructor(
    @InjectRepository(Specification)
    private specRepo: Repository<Specification>,
    @InjectRepository(CategorySpecification)
    private catSpecRepo: Repository<CategorySpecification>,
    @InjectRepository(ProductSpecificationValue)
    private productSpecRepo: Repository<ProductSpecificationValue>,
  ) {}

  // Créer une spécification
  async create(dto: CreateSpecificationDto) {
    const spec = this.specRepo.create({
      ...dto,
      options: dto.options ? dto.options.split(',').map((opt) => opt.trim()) : null,
    });
    await this.specRepo.save(spec);
    return { message: 'Spécification créée avec succès', data: spec };
  }

  async update(id: string, dto: UpdateSpecificationDto) {
    const spec = await this.specRepo.findOne({ where: { id } });
    if (!spec) throw new NotFoundException(`Spécification ${id} introuvable`);

    // Transformer options en tableau si présent
    if (dto.options !== undefined) {
      spec.options = dto.options ? dto.options.split(',').map((opt) => opt.trim()) : null;
    }

    // Mettre à jour les autres champs
    if (dto.key !== undefined) spec.key = dto.key;
    if (dto.label !== undefined) spec.label = dto.label;
    if (dto.type !== undefined) spec.type = dto.type;
    if (dto.unit !== undefined) spec.unit = dto.unit;

    await this.specRepo.save(spec);
    return { message: 'Spécification mise à jour avec succès', data: spec };
  }

  // Récupérer toutes les spécifications
  async findAll() {
    const specs = await this.specRepo.find({
      relations: ['categories', 'specificationValues'],
    });
    return { message: 'Liste des spécifications récupérée avec succès', data: specs };
  }

  // Récupérer une spécification par ID
  async findOne(id: string) {
    const spec = await this.specRepo.findOne({
      where: { id },
      relations: ['categories', 'specificationValues'],
    });
    if (!spec) throw new NotFoundException(`Spécification ${id} introuvable`);
    return { message: 'Spécification récupérée avec succès', data: spec };
  }

  // Supprimer une spécification
  async remove(id: string) {
    const spec = await this.specRepo.findOne({ where: { id } });
    if (!spec) throw new NotFoundException(`Spécification ${id} introuvable`);
    await this.specRepo.remove(spec);
    return { message: 'Spécification supprimée avec succès', data: null };
  }

  // Récupérer les spécifications pour une catégorie
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
}
