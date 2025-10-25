import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Attribute } from './entities/attributes.entity';
import { CreateAttributeDto } from './dto/create-attribute.dto';
import { UpdateAttributeDto } from './dto/update-attribute.dto';
import { AttributeType } from './enum/attributeType.enum';
import { AttributeValue } from './entities/attribute_values.entity';
import { slugify } from '../users/utility/slug/slugify';
import { CreateAttributeValueDto } from './dto/create-attribute-value.dto';

@Injectable()
export class AttributeService {
  private readonly logger = new Logger(AttributeService.name);

  constructor(
    @InjectRepository(Attribute)
    private readonly attributeRepo: Repository<Attribute>,
    @InjectRepository(AttributeValue)
    private readonly attributeValueRepo: Repository<AttributeValue>,
    private readonly dataSource: DataSource,
  ) {}

  // -------------------------------
  // Création d’un attribut
  // -------------------------------
  async create(
    createAttributeDto: CreateAttributeDto,
  ): Promise<{ message: string; data: Attribute }> {
    const { name, type, description, isRequired, isFilterable } = createAttributeDto;

    const existingAttribute = await this.attributeRepo.findOne({ where: { name } });
    if (existingAttribute) {
      throw new ConflictException('Un attribut avec ce nom existe déjà');
    }

    const slug = slugify(name, { lower: true, strict: true });

    return await this.dataSource.transaction(async (manager) => {
      const attribute = manager.create(Attribute, {
        name,
        slug,
        type,
        description,
        isRequired: isRequired ?? false,
        isFilterable: isFilterable ?? true,
      });

      const savedAttribute = await manager.save(attribute);

      // Recharger avec toutes les relations
      const attributeWithRelations = await manager.findOne(Attribute, {
        where: { id: savedAttribute.id },
        relations: ['values', 'categories', 'products', 'variations'],
      });

      this.logger.log(`✅ Attribut "${name}" créé avec succès`);

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
    const { name, type, description, isRequired, isFilterable } = updateAttributeDto;

    // Récupérer l'attribut existant avec toutes ses relations
    const attribute = await this.attributeRepo.findOne({
      where: { id },
      relations: ['values', 'categories', 'products', 'variations'],
    });

    if (!attribute) {
      throw new NotFoundException(`Attribut avec l'ID ${id} non trouvé`);
    }

    return await this.dataSource.transaction(async (manager) => {
      // Vérifier l'unicité du nom si modifié
      if (name && name !== attribute.name) {
        const existingAttribute = await manager.findOne(Attribute, { where: { name } });
        if (existingAttribute && existingAttribute.id !== id) {
          throw new ConflictException('Un attribut avec ce nom existe déjà');
        }
        attribute.name = name;
        attribute.slug = slugify(name, { lower: true, strict: true });
      }

      if (type) attribute.type = type;
      if (description !== undefined) attribute.description = description;
      if (isRequired !== undefined) attribute.isRequired = isRequired;
      if (isFilterable !== undefined) attribute.isFilterable = isFilterable;

      const updatedAttribute = await manager.save(attribute);

      // Recharger avec toutes les relations
      const attributeWithRelations = await manager.findOne(Attribute, {
        where: { id: updatedAttribute.id },
        relations: ['values', 'categories', 'products', 'variations'],
      });

      this.logger.log(`✅ Attribut "${attribute.name}" mis à jour avec succès`);

      return {
        message: 'Attribut mis à jour avec succès',
        data: attributeWithRelations!,
      };
    });
  }

  // -------------------------------
  // Création de plusieurs valeurs pour un attribut
  // -------------------------------
  async createSingleAttributeValue(
    body: CreateAttributeValueDto & { attributeId: string },
  ): Promise<{ message: string; data: AttributeValue }> {
    const { attributeId, value, displayName, color, imageUrl, position } = body;

    // Vérifier que l'attribut existe
    const attribute = await this.attributeRepo.findOne({ where: { id: attributeId } });
    if (!attribute) {
      throw new NotFoundException(`Attribut introuvable avec l'id ${attributeId}`);
    }

    return await this.dataSource.transaction(async (manager) => {
      // Vérifier si la valeur existe déjà
      const existingValue = await manager.findOne(AttributeValue, {
        where: { value, attribute: { id: attributeId } },
      });

      if (existingValue) {
        throw new ConflictException('Cette valeur existe déjà pour cet attribut');
      }

      // Création
      const attributeValue = manager.create(AttributeValue, {
        attribute,
        value,
        displayName,
        color,
        imageUrl,
        position,
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
    const { value, displayName, color, imageUrl, position } = body;

    // Chercher la valeur existante
    const attributeValue = await this.attributeValueRepo.findOne({
      where: { id },
      relations: ['attribute'],
    });

    if (!attributeValue) {
      throw new NotFoundException(`Valeur avec l'ID ${id} non trouvée`);
    }

    // Mise à jour
    if (value !== undefined) attributeValue.value = value;
    if (displayName !== undefined) attributeValue.displayName = displayName;
    if (color !== undefined) attributeValue.color = color;
    if (imageUrl !== undefined) attributeValue.imageUrl = imageUrl;
    if (position !== undefined) attributeValue.position = position;

    const updatedValue = await this.attributeValueRepo.save(attributeValue);

    return {
      message: 'Valeur mise à jour avec succès',
      data: updatedValue,
    };
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
  ): Promise<{ message: string; data: AttributeValue[] }> {
    // Vérifier que l'attribut existe
    const attribute = await this.attributeRepo.findOne({ where: { id: attributeId } });
    if (!attribute) {
      throw new NotFoundException(`Attribut introuvable avec l'id ${attributeId}`);
    }

    // Récupérer toutes les valeurs liées à cet attribut
    const values = await this.attributeValueRepo.find({
      where: { attribute: { id: attributeId } },
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
  async findAll(): Promise<Attribute[]> {
    return await this.attributeRepo.find({
      relations: ['values', 'categories', 'products', 'variations'],
      order: { name: 'ASC' },
    });
  }

  // -------------------------------
  // Récupération d’un attribut par id
  // -------------------------------
  async findOne(id: string): Promise<Attribute> {
    const attribute = await this.attributeRepo.findOne({
      where: { id },
      relations: ['values', 'categories', 'products', 'variations'],
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
      .innerJoin('attribute.categories', 'categoryAttr')
      .leftJoinAndSelect('attribute.values', 'values')
      .leftJoinAndSelect('attribute.products', 'products')
      .leftJoinAndSelect('attribute.variations', 'variations')
      .leftJoinAndSelect('categoryAttr.category', 'category')
      .where('categoryAttr.categoryId = :categoryId', { categoryId })
      .orderBy('attribute.name', 'ASC')
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
    const attributes = await this.attributeRepo.find({
      where: { type },
      relations: ['values', 'categories', 'products', 'variations'],
      order: { name: 'ASC' },
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
      where: { isFilterable: true },
      relations: ['values', 'categories', 'products', 'variations'],
      order: { name: 'ASC' },
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
  // Soft delete
  // -------------------------------
  async softDelete(id: string): Promise<{ message: string }> {
    const attribute = await this.findOne(id);
    await this.attributeRepo.softDelete(id);

    this.logger.log(`✅ Attribut "${attribute.name}" supprimé (soft delete) avec succès`);
    return { message: 'Attribut supprimé avec succès' };
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
      attribute,
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
