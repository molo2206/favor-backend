import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { GlobalAttribute } from './entities/global_attributes.entity';
import { GlobalAttributeValue } from './entities/global_attribute_values.entity';
import { CreateGlobalAttributeDto } from './dto/create-global-attribute.dto';
import { UpdateGlobalAttributeDto } from './dto/update-global-attribute.dto';
import { SpecFieldType } from 'src/specification/enum/SpecFieldType';
import { CreateCategoryAttributeDto } from './dto/create-category-attribute.dto';
import { CategoryAttribute } from './entities/category_attributes.entity';
import { CategoryEntity } from 'src/category/entities/category.entity';

@Injectable()
export class GlobalAttributeService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(CategoryAttribute)
    private readonly categoryAttributeRepo: Repository<CategoryAttribute>,

    @InjectRepository(CategoryEntity)
    private readonly categoryRepo: Repository<CategoryEntity>,

    @InjectRepository(GlobalAttribute)
    private readonly globalAttrRepo: Repository<GlobalAttribute>,

    @InjectRepository(GlobalAttributeValue)
    private readonly globalAttrValueRepo: Repository<GlobalAttributeValue>,
  ) {}

  // 🔹 Créer un attribut global avec valeurs optionnelles
  async create(data: CreateGlobalAttributeDto) {
    return await this.dataSource.transaction(async (manager) => {
      // Transformer la chaîne CSV en tableau
      let optionsArray: string[] | undefined = undefined;
      if (data.options) {
        optionsArray = data.options.split(',').map((opt) => opt.trim());
      }

      // Créer l'entité avec type en string et options en tableau JSON
      const attribute = manager.create(GlobalAttribute, {
        key: data.key,
        label: data.label,
        type: data.type, // type comme string
        options: optionsArray,
      });

      // Sauvegarder dans la base
      const savedAttribute = await manager.save(attribute);

      return {
        message: 'Attribut global créé avec succès.',
        data: { ...savedAttribute },
      };
    });
  }

  //  Récupérer tous les attributs
  async findAll() {
    const attributes = await this.globalAttrRepo.find({
      order: { createdAt: 'DESC' },
    });
    return {
      message: attributes.length
        ? 'Attributs récupérés avec succès.'
        : 'Aucun attribut trouvé.',
      data: attributes,
    };
  }

  async findOne(id: string) {
    const attribute = await this.globalAttrRepo.findOne({
      where: { id },
    });
    if (!attribute) throw new NotFoundException(`GlobalAttribute avec l'id ${id} introuvable`);
    return { message: 'Attribut récupéré avec succès.', data: attribute };
  }

  async update(id: string, data: UpdateGlobalAttributeDto) {
    const attribute = await this.globalAttrRepo.findOne({ where: { id } });
    if (!attribute) throw new NotFoundException(`GlobalAttribute avec l'id ${id} introuvable`);

    // Mettre à jour les champs simples
    if (data.key) attribute.key = data.key;
    if (data.label) attribute.label = data.label;
    if (data.type) attribute.type = data.type; // string simple

    // Transformer options CSV en tableau si présent
    if (data.options !== undefined) {
      attribute.options = data.options ? data.options.split(',').map((opt) => opt.trim()) : [];
    }

    await this.globalAttrRepo.save(attribute);

    return {
      message: 'Attribut global mis à jour avec succès.',
      data: attribute,
    };
  }

  async remove(id: string) {
    const attribute = await this.globalAttrRepo.findOne({ where: { id } });
    if (!attribute) throw new NotFoundException(`GlobalAttribute avec l'id ${id} introuvable`);
    await this.globalAttrRepo.remove(attribute);
    return { message: 'Attribut supprimé avec succès.', data: null };
  }

  async removeValue(valueId: string) {
    const value = await this.globalAttrValueRepo.findOne({ where: { id: valueId } });
    if (!value) throw new NotFoundException(`Valeur avec l'id ${valueId} introuvable`);
    await this.globalAttrValueRepo.remove(value);
    return { message: 'Valeur supprimée avec succès.', data: null };
  }

  async createMany(dto: CreateCategoryAttributeDto) {
    const category = await this.categoryRepo.findOne({ where: { id: dto.category_id } });
    if (!category) throw new NotFoundException('Catégorie introuvable');

    // 🔹 Supprimer les anciennes relations de cette catégorie
    await this.categoryAttributeRepo.delete({ category: { id: category.id } });

    const relations: CategoryAttribute[] = [];

    for (const attr of dto.attributes) {
      const attribute = await this.globalAttrRepo.findOne({
        where: { id: attr.attribute_id },
      });
      if (!attribute) throw new NotFoundException(`Attribut ${attr.attribute_id} introuvable`);

      const relation = this.categoryAttributeRepo.create({
        category,
        attribute,
      });

      relations.push(relation);
    }

    const saved = await this.categoryAttributeRepo.save(relations);

    return {
      message: 'Attributs liés à la catégorie avec succès',
      data: saved,
    };
  }

  async findAttributesByCategory(categoryId: string) {
    const catAttrs = await this.categoryAttributeRepo.find({
      where: { category: { id: categoryId } },
      relations: ['attribute'],
    });

    return {
      message: `Attributs de la catégorie ${categoryId} récupérés`,
      data: catAttrs.map((ca) => ca.attribute),
    };
  }
}
