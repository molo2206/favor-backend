import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GlobalAttribute } from './entities/global_attributes.entity';
import { GlobalAttributeValue } from './entities/global_attribute_values.entity';
import { UpdateGlobalAttributeDto } from './dto/update-global-attribute.dto';

@Injectable()
export class GlobalAttributeService {
  constructor(
    @InjectRepository(GlobalAttribute)
    private readonly globalAttrRepo: Repository<GlobalAttribute>,

    @InjectRepository(GlobalAttributeValue)
    private readonly globalAttrValueRepo: Repository<GlobalAttributeValue>,
  ) {}

  // Créer un nouvel attribut global
  async createWithValues(data: {
    name: string;
    platform: string;
    values?: Partial<GlobalAttributeValue>[];
  }) {
    // 🔹 Création de l'attribut global
    const attribute = this.globalAttrRepo.create({
      name: data.name,
      platform: data.platform,
    });
    const savedAttribute = await this.globalAttrRepo.save(attribute);

    let savedValues: GlobalAttributeValue[] = [];
    // 🔹 Si des valeurs sont fournies, les créer
    if (data.values && data.values.length > 0) {
      const valuesEntities = data.values.map((val) =>
        this.globalAttrValueRepo.create({ ...val, attribute: savedAttribute }),
      );
      savedValues = await this.globalAttrValueRepo.save(valuesEntities);
    }

    return {
      message: 'Attribut global créé avec succès.',
      data: {
        ...savedAttribute,
        values: savedValues,
      },
    };
  }

  //  Récupérer tous les attributs avec leurs valeurs
  async findAll(platform?: string) {
    const query = this.globalAttrRepo
      .createQueryBuilder('attribute')
      .leftJoinAndSelect('attribute.values', 'values')
      .orderBy('attribute.createdAt', 'DESC');

    if (platform) {
      query.where('attribute.platform = :platform', { platform });
    }

    const attributes = await query.getMany();
    return {
      message:
        attributes.length === 0 ? 'Aucun attribut trouvé.' : 'Attributs récupérés avec succès.',
      data: attributes,
    };
  }

  //  Récupérer un attribut par ID
  async findOne(id: string) {
    const attribute = await this.globalAttrRepo.findOne({
      where: { id },
      relations: ['values'],
    });
    if (!attribute) {
      throw new NotFoundException(`GlobalAttribute avec l'id ${id} introuvable`);
    }
    return {
      message: 'Attribut récupéré avec succès.',
      data: attribute,
    };
  }

  //  Mettre à jour un attribut
  async updateWithValues(id: string, data: UpdateGlobalAttributeDto) {
    // 1️⃣ Mettre à jour l'attribut global
    const attribute = await this.globalAttrRepo.findOne({
      where: { id },
      relations: ['values'],
    });
    if (!attribute) throw new NotFoundException(`GlobalAttribute avec l'id ${id} introuvable`);

    if (data.name) attribute.name = data.name;
    if (data.platform) attribute.platform = data.platform;

    await this.globalAttrRepo.save(attribute);

    // 2️⃣ Gérer les valeurs
    let updatedValues: GlobalAttributeValue[] = [];
    if (data.values && data.values.length > 0) {
      for (const val of data.values) {
        if (val.id) {
          // Mettre à jour une valeur existante
          const existing = attribute.values.find((v) => v.id === val.id);
          if (existing) {
            existing.value = val.value ?? existing.value; // garde l'ancienne valeur si undefined
            updatedValues.push(await this.globalAttrValueRepo.save(existing));
          }
        } else {
          // Ajouter une nouvelle valeur
          const newVal = this.globalAttrValueRepo.create({ value: val.value, attribute });
          updatedValues.push(await this.globalAttrValueRepo.save(newVal));
        }
      }
    }

    // 3️⃣ Retourner l’attribut avec ses valeurs mises à jour
    const refreshedAttribute = await this.globalAttrRepo.findOne({
      where: { id },
      relations: ['values'],
    });

    return {
      message: 'Attribut global mis à jour avec succès.',
      data: refreshedAttribute,
    };
  }

  // Supprimer un attribut
  async remove(id: string) {
    const attribute = await this.globalAttrRepo.findOne({ where: { id } });
    if (!attribute) {
      throw new NotFoundException(`GlobalAttribute avec l'id ${id} introuvable`);
    }
    await this.globalAttrRepo.remove(attribute);
    return {
      message: 'Attribut supprimé avec succès.',
      data: null,
    };
  }

  //  Ajouter une valeur à un attribut
  async addValue(valueData: Partial<GlobalAttributeValue>) {
    const attribute = await this.globalAttrRepo.findOne({
      where: { id: valueData.attributeId },
    });
    if (!attribute) {
      throw new NotFoundException(
        `GlobalAttribute avec l'id ${valueData.attributeId} introuvable`,
      );
    }
    const value = this.globalAttrValueRepo.create({ ...valueData, attribute });
    const saved = await this.globalAttrValueRepo.save(value);
    return {
      message: 'Valeur ajoutée à l’attribut avec succès.',
      data: saved,
    };
  }

  //  Supprimer une valeur
  async removeValue(valueId: string) {
    const value = await this.globalAttrValueRepo.findOne({ where: { id: valueId } });
    if (!value) throw new NotFoundException(`Valeur avec l'id ${valueId} introuvable`);
    await this.globalAttrValueRepo.remove(value);
    return {
      message: 'Valeur supprimée avec succès.',
      data: null,
    };
  }
}
