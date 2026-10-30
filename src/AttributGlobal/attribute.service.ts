import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager, In, Not } from 'typeorm';
import { Attribute } from './entities/attributes.entity';
import { CreateAttributeDto } from './dto/create-attribute.dto';
import { UpdateAttributeDto } from './dto/update-attribute.dto';
import { ATTRIBUTE_TYPES_WITH_VALUES, AttributeType } from './enum/attributeType.enum';
import { AttributeValue } from './entities/attribute_values.entity';
import { slugify } from '../users/utility/slug/slugify';
import { CreateAttributeValueDto } from './dto/create-attribute-value.dto';
import { CategoryAttribute } from './entities/category_attributes.entity';
import { CategoryEntity } from 'src/category/entities/category.entity';
import { VariationAttributeValue } from './entities/variation_attribute_values.entity';
import { ProductAttributeValue } from './entities/product_attribute_values.entity';

const ATTRIBUTE_RELATIONS = ['values', 'categories', 'categories.category', 'products', 'variations'];

@Injectable()
export class AttributeService {
  private readonly logger = new Logger(AttributeService.name);

  constructor(
    @InjectRepository(Attribute)
    private readonly attributeRepo: Repository<Attribute>,
    @InjectRepository(AttributeValue)
    private readonly attributeValueRepo: Repository<AttributeValue>,
    private readonly dataSource: DataSource,
  ) { }

  // ============================================================
  // OUTILS
  // ============================================================

  /** Slug unique (ajoute -2, -3… si le slug existe déjà, y compris parmi les attributs supprimés) */
  private async uniqueSlug(manager: EntityManager, name: string, excludeId?: string): Promise<string> {
    const base = slugify(name, { lower: true, strict: true }) || 'attribut';
    let candidate = base;
    for (let i = 2; i < 500; i++) {
      const found = await manager.findOne(Attribute, { where: { slug: candidate }, withDeleted: true });
      if (!found || found.id === excludeId) return candidate;
      candidate = `${base}-${i}`;
    }
    return `${base}-${Date.now()}`;
  }

  /** Lie l'attribut aux catégories données (la liste remplace l'ancienne) */
  private async syncCategories(manager: EntityManager, attributeId: string, categoryIds: string[]): Promise<void> {
    const ids = Array.from(new Set((categoryIds ?? []).filter(Boolean)));
    if (ids.length) {
      const categories = await manager.find(CategoryEntity, { where: { id: In(ids) } });
      const found = new Set(categories.map((c) => c.id));
      const missing = ids.filter((id) => !found.has(id));
      if (missing.length) {
        throw new NotFoundException(`Catégorie(s) introuvable(s) : ${missing.join(', ')}`);
      }
    }

    const existing = await manager.find(CategoryAttribute, { where: { attributeId } });
    const existingIds = new Set(existing.map((c) => c.categoryId));

    for (const categoryId of ids) {
      if (existingIds.has(categoryId)) continue;
      await manager.save(
        CategoryAttribute,
        manager.create(CategoryAttribute, {
          categoryId,
          attributeId,
          category: { id: categoryId } as CategoryEntity,
          attribute: { id: attributeId } as Attribute,
          isRequired: false,
          position: 0,
        }),
      );
    }

    const toRemove = existing.filter((c) => !ids.includes(c.categoryId)).map((c) => c.id);
    if (toRemove.length) await manager.delete(CategoryAttribute, { id: In(toRemove) });
  }

  /**
   * Crée / met à jour les valeurs envoyées avec l'attribut.
   * Les valeurs absentes de la liste ne sont PAS supprimées (elles peuvent être utilisées par des produits).
   */
  private async upsertValues(
    manager: EntityManager,
    attribute: Attribute,
    values: CreateAttributeValueDto[],
  ): Promise<void> {
    if (!values?.length) return;
    if (!ATTRIBUTE_TYPES_WITH_VALUES.includes(attribute.type)) {
      throw new BadRequestException(
        `L'attribut "${attribute.name}" (type ${attribute.type}) n'accepte pas de liste de valeurs`,
      );
    }

    const seen = new Set<string>();
    for (let index = 0; index < values.length; index++) {
      const v = values[index];
      const text = String(v?.value ?? '').trim();
      if (!text) throw new BadRequestException('Chaque valeur doit avoir un texte (value)');
      const key = text.toLowerCase();
      if (seen.has(key)) throw new ConflictException(`La valeur "${text}" est envoyée deux fois`);
      seen.add(key);

      let entity: AttributeValue | null = null;
      if (v.id) {
        entity = await manager.findOne(AttributeValue, { where: { id: v.id, attributeId: attribute.id } });
        if (!entity) throw new NotFoundException(`Valeur avec l'ID ${v.id} non trouvée`);
      } else {
        entity = await manager.findOne(AttributeValue, { where: { attributeId: attribute.id, value: text } });
      }

      if (entity && entity.value !== text) {
        const clash = await manager.findOne(AttributeValue, {
          where: { attributeId: attribute.id, value: text, id: Not(entity.id) },
        });
        if (clash) throw new ConflictException(`La valeur "${text}" existe déjà pour cet attribut`);
      }

      if (!entity) {
        entity = manager.create(AttributeValue, {
          attributeId: attribute.id,
          attribute: { id: attribute.id } as Attribute,
        }) as AttributeValue;
      }
      const target: AttributeValue = entity;
      target.value = text;
      if (v.displayName !== undefined) target.displayName = v.displayName;
      else if (!target.displayName) target.displayName = text;
      if (v.color !== undefined) target.color = v.color;
      if (v.imageUrl !== undefined) target.imageUrl = v.imageUrl;
      target.position = v.position ?? target.position ?? index;
      if (v.isActive !== undefined) target.isActive = v.isActive;
      else if (target.isActive === undefined) target.isActive = true;

      await manager.save(AttributeValue, target);
    }
  }

  // -------------------------------
  // Création d’un attribut
  // -------------------------------
  async create(
    createAttributeDto: CreateAttributeDto,
  ): Promise<{ message: string; data: Attribute }> {
    const {
      name,
      type,
      description,
      isRequired,
      isFilterable,
      isVariant,
      isVisible,
      isActive,
      unit,
      position,
      categoryIds,
      values,
    } = createAttributeDto;

    const cleanName = String(name ?? '').trim();
    if (!cleanName) throw new BadRequestException("Le nom de l'attribut est obligatoire");

    const existingAttribute = await this.attributeRepo.findOne({ where: { name: cleanName } });
    if (existingAttribute) {
      throw new ConflictException('Un attribut avec ce nom existe déjà');
    }

    return await this.dataSource.transaction(async (manager) => {
      const slug = await this.uniqueSlug(
        manager,
        createAttributeDto.slug?.trim() ? createAttributeDto.slug : cleanName,
      );

      const attribute = manager.create(Attribute, {
        name: cleanName,
        slug,
        type,
        description,
        isRequired: isRequired ?? false,
        isFilterable: isFilterable ?? true,
        isVariant: isVariant ?? ATTRIBUTE_TYPES_WITH_VALUES.includes(type),
        isVisible: isVisible ?? true,
        isActive: isActive ?? true,
        unit: unit ?? null,
        position: position ?? 0,
      });

      const savedAttribute = await manager.save(attribute);

      if (values?.length) await this.upsertValues(manager, savedAttribute, values);
      if (categoryIds !== undefined) await this.syncCategories(manager, savedAttribute.id, categoryIds);

      // Recharger avec toutes les relations
      const attributeWithRelations = await manager.findOne(Attribute, {
        where: { id: savedAttribute.id },
        relations: ATTRIBUTE_RELATIONS,
      });

      this.logger.log(`✅ Attribut "${cleanName}" créé avec succès`);

      return {
        message: 'Attribut créé avec succès',
        data: attributeWithRelations!,
      };
    });
  }

  // -------------------------------
  // Mise à jour d’un attribut
  // -------------------------------

  async update(
    id: string,
    updateAttributeDto: UpdateAttributeDto,
  ): Promise<{ message: string; data: Attribute }> {
    const {
      name,
      slug,
      type,
      description,
      isRequired,
      isFilterable,
      isVariant,
      isVisible,
      isActive,
      unit,
      position,
      categoryIds,
      values,
    } = updateAttributeDto;

    const attribute = await this.attributeRepo.findOne({ where: { id } });
    if (!attribute) {
      throw new NotFoundException(`Attribut avec l'ID ${id} non trouvé`);
    }

    return await this.dataSource.transaction(async (manager) => {
      // Vérifier l'unicité du nom si modifié
      if (name && name.trim() && name.trim() !== attribute.name) {
        const cleanName = name.trim();
        const existingAttribute = await manager.findOne(Attribute, { where: { name: cleanName } });
        if (existingAttribute && existingAttribute.id !== id) {
          throw new ConflictException('Un attribut avec ce nom existe déjà');
        }
        attribute.name = cleanName;
        attribute.slug = await this.uniqueSlug(manager, slug?.trim() ? slug : cleanName, id);
      } else if (slug && slug.trim()) {
        attribute.slug = await this.uniqueSlug(manager, slug, id);
      }

      if (type && type !== attribute.type) {
        // Passer d'un type "liste" à un type libre est refusé si des valeurs existent déjà
        const hasValues = await manager.count(AttributeValue, { where: { attributeId: id } });
        if (hasValues > 0 && !ATTRIBUTE_TYPES_WITH_VALUES.includes(type)) {
          throw new BadRequestException(
            `Impossible de passer au type ${type} : l'attribut possède déjà des valeurs`,
          );
        }
        attribute.type = type;
      }
      if (description !== undefined) attribute.description = description;
      if (isRequired !== undefined) attribute.isRequired = isRequired;
      if (isFilterable !== undefined) attribute.isFilterable = isFilterable;
      if (isVariant !== undefined) attribute.isVariant = isVariant;
      if (isVisible !== undefined) attribute.isVisible = isVisible;
      if (isActive !== undefined) attribute.isActive = isActive;
      if (unit !== undefined) attribute.unit = unit || null;
      if (position !== undefined) attribute.position = position;

      const updatedAttribute = await manager.save(attribute);

      if (values?.length) await this.upsertValues(manager, updatedAttribute, values);
      if (categoryIds !== undefined) await this.syncCategories(manager, updatedAttribute.id, categoryIds);

      // Recharger avec toutes les relations
      const attributeWithRelations = await manager.findOne(Attribute, {
        where: { id: updatedAttribute.id },
        relations: ATTRIBUTE_RELATIONS,
      });

      this.logger.log(`✅ Attribut "${attribute.name}" mis à jour avec succès`);

      return {
        message: 'Attribut mis à jour avec succès',
        data: attributeWithRelations!,
      };
    });
  }

  // -------------------------------
  // Création d'une valeur pour un attribut
  // -------------------------------
  async createSingleAttributeValue(
    body: CreateAttributeValueDto & { attributeId: string },
  ): Promise<{ message: string; data: AttributeValue }> {
    const { attributeId, value, displayName, color, imageUrl, position, isActive } = body;

    if (!attributeId) {
      throw new BadRequestException('attributeId est obligatoire');
    }

    // Vérifier que l'attribut existe
    const attribute = await this.attributeRepo.findOne({ where: { id: attributeId } });
    if (!attribute) {
      throw new NotFoundException(`Attribut introuvable avec l'id ${attributeId}`);
    }
    if (!ATTRIBUTE_TYPES_WITH_VALUES.includes(attribute.type)) {
      throw new BadRequestException(
        `L'attribut "${attribute.name}" (type ${attribute.type}) n'accepte pas de liste de valeurs`,
      );
    }

    const text = String(value ?? '').trim();
    if (!text) throw new BadRequestException('La valeur est obligatoire');

    return await this.dataSource.transaction(async (manager) => {
      // Vérifier si la valeur existe déjà
      const existingValue = await manager.findOne(AttributeValue, {
        where: { value: text, attribute: { id: attributeId } },
      });

      if (existingValue) {
        throw new ConflictException('Cette valeur existe déjà pour cet attribut');
      }

      let finalPosition = position;
      if (finalPosition === undefined) {
        finalPosition = await manager.count(AttributeValue, { where: { attributeId } });
      }

      // Création
      const attributeValue = manager.create(AttributeValue, {
        attribute,
        attributeId,
        value: text,
        displayName: displayName ?? text,
        color,
        imageUrl,
        position: finalPosition,
        isActive: isActive ?? true,
      });

      const savedValue = await manager.save(attributeValue);

      const valueWithRelations = await manager.findOne(AttributeValue, {
        where: { id: savedValue.id },
        relations: ['attribute'],
      });

      return {
        message: 'Valeur créée avec succès',
        data: valueWithRelations!,
      };
    });
  }

  async updateSingleAttributeValue(
    id: string,
    body: Partial<CreateAttributeValueDto>,
  ): Promise<{ message: string; data: AttributeValue }> {
    const { value, displayName, color, imageUrl, position, isActive } = body;

    // Chercher la valeur existante
    const attributeValue = await this.attributeValueRepo.findOne({
      where: { id },
      relations: ['attribute'],
    });

    if (!attributeValue) {
      throw new NotFoundException(`Valeur avec l'ID ${id} non trouvée`);
    }

    // Mise à jour
    if (value !== undefined) {
      const text = String(value).trim();
      if (!text) throw new BadRequestException('La valeur est obligatoire');
      if (text !== attributeValue.value) {
        const clash = await this.attributeValueRepo.findOne({
          where: { attributeId: attributeValue.attributeId, value: text, id: Not(id) },
        });
        if (clash) throw new ConflictException('Cette valeur existe déjà pour cet attribut');
      }
      attributeValue.value = text;
    }
    if (displayName !== undefined) attributeValue.displayName = displayName;
    if (color !== undefined) attributeValue.color = color;
    if (imageUrl !== undefined) attributeValue.imageUrl = imageUrl;
    if (position !== undefined) attributeValue.position = position;
    if (isActive !== undefined) attributeValue.isActive = isActive;

    const updatedValue = await this.attributeValueRepo.save(attributeValue);

    return {
      message: 'Valeur mise à jour avec succès',
      data: updatedValue,
    };
  }

  /**
   * Supprime une valeur.
   * Si elle est utilisée par une variation ou un produit, elle est seulement désactivée
   * (les commandes passées gardent leur copie du texte dans order_item_attributes).
   */
  async removeAttributeValue(id: string): Promise<{ message: string; data: { id: string; deleted: boolean } }> {
    const attributeValue = await this.attributeValueRepo.findOne({ where: { id } });
    if (!attributeValue) {
      throw new NotFoundException(`Valeur avec l'ID ${id} non trouvée`);
    }

    const usedByVariations = await this.dataSource
      .getRepository(VariationAttributeValue)
      .count({ where: { attributeValueId: id } });
    const usedByProducts = await this.dataSource
      .getRepository(ProductAttributeValue)
      .count({ where: { attributeValueId: id } });

    if (usedByVariations + usedByProducts > 0) {
      attributeValue.isActive = false;
      await this.attributeValueRepo.save(attributeValue);
      return {
        message: 'Valeur utilisée par des produits : elle a été désactivée au lieu d’être supprimée',
        data: { id, deleted: false },
      };
    }

    await this.attributeValueRepo.delete({ id });
    return { message: 'Valeur supprimée avec succès', data: { id, deleted: true } };
  }

  async getOneValue(id: string): Promise<{ message: string; data: AttributeValue }> {
    const attributeValue = await this.attributeValueRepo.findOne({
      where: { id },
      relations: ['attribute'],
    });

    if (!attributeValue) {
      throw new NotFoundException(`Valeur avec l'ID ${id} non trouvée`);
    }

    return {
      message: 'Valeur récupérée avec succès',
      data: attributeValue,
    };
  }

  async getValuesByAttribute(
    attributeId: string,
    includeInactive = true,
  ): Promise<{ message: string; data: AttributeValue[] }> {
    // Vérifier que l'attribut existe
    const attribute = await this.attributeRepo.findOne({ where: { id: attributeId } });
    if (!attribute) {
      throw new NotFoundException(`Attribut introuvable avec l'id ${attributeId}`);
    }

    // Récupérer toutes les valeurs liées à cet attribut
    const values = await this.attributeValueRepo.find({
      where: includeInactive
        ? { attribute: { id: attributeId } }
        : { attribute: { id: attributeId }, isActive: true },
      relations: ['attribute'],
      order: { position: 'ASC' },
    });

    return {
      message: `Valeurs de l'attribut "${attribute.name}" récupérées avec succès`,
      data: values,
    };
  }

  // -------------------------------
  // Récupération de tous les attributs
  // -------------------------------
  async findAll(onlyActive = false): Promise<Attribute[]> {
    return await this.attributeRepo.find({
      where: onlyActive ? { isActive: true } : {},
      relations: ATTRIBUTE_RELATIONS,
      order: { position: 'ASC', name: 'ASC' },
    });
  }

  // -------------------------------
  // Récupération d’un attribut par id
  // -------------------------------
  async findOne(id: string): Promise<Attribute> {
    const attribute = await this.attributeRepo.findOne({
      where: { id },
      relations: ATTRIBUTE_RELATIONS,
    });

    if (!attribute) {
      throw new NotFoundException(`Attribut avec l'ID ${id} non trouvé`);
    }

    return attribute;
  }

  async findAttributesByCategory(
    categoryId: string,
  ): Promise<{ message: string; data: Attribute[] }> {
    const attributes = await this.attributeRepo
      .createQueryBuilder('attribute')
      .innerJoinAndSelect('attribute.categories', 'categoryAttr')
      .leftJoinAndSelect('attribute.values', 'values', 'values.isActive = :active', { active: true })
      .leftJoinAndSelect('attribute.products', 'products')
      .leftJoinAndSelect('attribute.variations', 'variations')
      .leftJoinAndSelect('categoryAttr.category', 'category')
      .where('categoryAttr.categoryId = :categoryId', { categoryId })
      .andWhere('attribute.isActive = :active', { active: true })
      .orderBy('categoryAttr.position', 'ASC')
      .addOrderBy('attribute.position', 'ASC')
      .addOrderBy('attribute.name', 'ASC')
      .addOrderBy('values.position', 'ASC')
      .getMany();

    return {
      message: `Attributs de la catégorie ${categoryId} récupérés avec succès`,
      data: attributes,
    };
  }

  // -------------------------------
  // Récupération par type
  // -------------------------------
  async findByType(type: AttributeType): Promise<Attribute[]> {
    if (!Object.values(AttributeType).includes(type)) {
      throw new BadRequestException(
        `Le type doit être l'un des suivants : ${Object.values(AttributeType).join(', ')}`,
      );
    }
    const attributes = await this.attributeRepo.find({
      where: { type },
      relations: ATTRIBUTE_RELATIONS,
      order: { position: 'ASC', name: 'ASC' },
    });

    if (!attributes.length) {
      throw new NotFoundException(`Aucun attribut trouvé pour le type ${type}`);
    }

    return attributes;
  }

  // -------------------------------
  // Récupération filtrable
  // -------------------------------
  async findByFilterable(): Promise<Attribute[]> {
    return await this.attributeRepo.find({
      where: { isFilterable: true, isActive: true },
      relations: ATTRIBUTE_RELATIONS,
      order: { position: 'ASC', name: 'ASC' },
    });
  }

  // -------------------------------
  // Suppression complète
  // -------------------------------
  async remove(id: string): Promise<{ message: string }> {
    const attribute = await this.findOne(id);

    const isUsed = await this.isAttributeUsed(id);
    if (isUsed) {
      throw new BadRequestException(
        'Impossible de supprimer cet attribut car il est utilisé par des produits, catégories ou variations',
      );
    }

    await this.attributeRepo.remove(attribute);

    this.logger.log(`✅ Attribut "${attribute.name}" supprimé avec succès`);
    return { message: 'Attribut supprimé avec succès' };
  }

  // -------------------------------
  // Soft delete (colonne deletedAt)
  // -------------------------------
  async softDelete(id: string): Promise<{ message: string }> {
    const attribute = await this.findOne(id);
    await this.attributeRepo.update({ id }, { isActive: false });
    await this.attributeRepo.softDelete(id);

    this.logger.log(`✅ Attribut "${attribute.name}" supprimé (soft delete) avec succès`);
    return { message: 'Attribut supprimé avec succès' };
  }

  // -------------------------------
  // Restaurer un attribut supprimé (soft delete)
  // -------------------------------
  async restore(id: string): Promise<{ message: string; data: Attribute }> {
    const attribute = await this.attributeRepo.findOne({ where: { id }, withDeleted: true });
    if (!attribute) {
      throw new NotFoundException(`Attribut avec l'ID ${id} non trouvé`);
    }
    await this.attributeRepo.restore(id);
    await this.attributeRepo.update({ id }, { isActive: true });
    return { message: 'Attribut restauré avec succès', data: await this.findOne(id) };
  }

  // -------------------------------
  // Vérifie si l'attribut est utilisé
  // -------------------------------
  private async isAttributeUsed(id: string): Promise<boolean> {
    const attribute = await this.attributeRepo.findOne({
      where: { id },
      relations: ['products', 'categories', 'variations'],
    });

    return !!(
      attribute &&
      (attribute.products.length > 0 ||
        attribute.categories.length > 0 ||
        attribute.variations.length > 0)
    );
  }

  // -------------------------------
  // Ajout d’une valeur unique
  // -------------------------------
  async addValueToAttribute(
    attributeId: string,
    valueData: { value: string; displayOrder?: number },
  ): Promise<{ message: string; data: AttributeValue }> {
    const attribute = await this.findOne(attributeId);

    const existingValue = await this.attributeValueRepo.findOne({
      where: { value: valueData.value, attribute: { id: attributeId } },
    });

    if (existingValue) {
      throw new ConflictException('Cette valeur existe déjà pour cet attribut');
    }

    const attributeValue = this.attributeValueRepo.create({
      value: valueData.value,
      displayName: valueData.value,
      position: valueData.displayOrder,
      attribute,
      attributeId,
      isActive: true,
    });

    const savedValue = await this.attributeValueRepo.save(attributeValue);

    const valueWithRelations = await this.attributeValueRepo.findOne({
      where: { id: savedValue.id },
      relations: ['attribute'],
    });

    return {
      message: "Valeur ajoutée avec succès à l'attribut",
      data: valueWithRelations!,
    };
  }
}
