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

  async create(
    createAttributeDto: CreateAttributeDto,
  ): Promise<{ message: string; data: Attribute }> {
    const { name, type, description, isRequired, isFilterable, values } = createAttributeDto;

    const existingAttribute = await this.attributeRepo.findOne({
      where: { name },
    });
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

      if (Array.isArray(values) && values.length > 0) {
        const attributeValues = values.map((value) =>
          manager.create(AttributeValue, {
            value: value.value,
            attribute: savedAttribute,
          }),
        );
        await manager.save(attributeValues);
      }

      const attributeWithRelations = await manager.findOne(Attribute, {
        where: { id: savedAttribute.id },
        relations: ['values'],
      });

      this.logger.log(`✅ Attribut "${name}" créé avec succès`);

      return {
        message: 'Attribut créé avec succès',
        data: attributeWithRelations!,
      };
    });
  }

  async findAll(): Promise<Attribute[]> {
    return await this.attributeRepo.find({
      relations: ['values'],
      order: {
        name: 'ASC',
      },
    });
  }

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

  async findByType(type: AttributeType): Promise<Attribute[]> {
    const attributes = await this.attributeRepo.find({
      where: { type },
      relations: ['values'],
      order: {
        name: 'ASC',
      },
    });

    if (!attributes.length) {
      throw new NotFoundException(`Aucun attribut trouvé pour le type ${type}`);
    }

    return attributes;
  }

  async findByFilterable(): Promise<Attribute[]> {
    return await this.attributeRepo.find({
      where: { isFilterable: true },
      relations: ['values'],
      order: {
        name: 'ASC',
      },
    });
  }

  async update(
    id: string,
    updateAttributeDto: UpdateAttributeDto,
  ): Promise<{ message: string; data: Attribute }> {
    const { name, type, description, isRequired, isFilterable, values } = updateAttributeDto;

    const attribute = await this.findOne(id);

    return await this.dataSource.transaction(async (manager) => {
      // Vérifier l'unicité du nom si modifié
      if (name && name !== attribute.name) {
        const existingAttribute = await manager.findOne(Attribute, {
          where: { name },
        });
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

      // Mettre à jour les valeurs si fournies
      if (Array.isArray(values)) {
        // Supprimer les anciennes valeurs
        await manager.delete(AttributeValue, { attribute: { id } });

        // Créer les nouvelles valeurs
        if (values.length > 0) {
          const attributeValues = values.map((value) =>
            manager.create(AttributeValue, {
              value: value.value,
              attribute: updatedAttribute,
            }),
          );
          await manager.save(attributeValues);
        }
      }

      // Recharger l'attribut avec ses relations
      const attributeWithRelations = await manager.findOne(Attribute, {
        where: { id: updatedAttribute.id },
        relations: ['values'],
      });

      this.logger.log(`✅ Attribut "${attribute.name}" mis à jour avec succès`);

      return {
        message: 'Attribut mis à jour avec succès',
        data: attributeWithRelations!,
      };
    });
  }

  async remove(id: string): Promise<{ message: string }> {
    const attribute = await this.findOne(id);

    // Vérifier si l'attribut est utilisé
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

  async softDelete(id: string): Promise<{ message: string }> {
    const attribute = await this.findOne(id);

    await this.attributeRepo.softDelete(id);

    this.logger.log(`✅ Attribut "${attribute.name}" supprimé (soft delete) avec succès`);

    return { message: 'Attribut supprimé avec succès' };
  }

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

    return {
      message: "Valeur ajoutée avec succès à l'attribut",
      data: savedValue,
    };
  }
}
