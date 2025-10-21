import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { GlobalAttribute } from './entities/global_attributes.entity';
import { GlobalAttributeValue } from './entities/global_attribute_values.entity';
import { CreateGlobalAttributeDto } from './dto/create-global-attribute.dto';
import { UpdateGlobalAttributeDto } from './dto/update-global-attribute.dto';
import { SpecFieldType } from 'src/specification/enum/SpecFieldType';

@Injectable()
export class GlobalAttributeService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(GlobalAttribute)
    private readonly globalAttrRepo: Repository<GlobalAttribute>,

    @InjectRepository(GlobalAttributeValue)
    private readonly globalAttrValueRepo: Repository<GlobalAttributeValue>,
  ) {}

  // 🔹 Créer un attribut global avec valeurs optionnelles
  async create(data: CreateGlobalAttributeDto) {
    return await this.dataSource.transaction(async (manager) => {
      const attribute = manager.create(GlobalAttribute, {
        key: data.key,
        label: data.label,
        unit: data.unit,
        options: data.options,
      });

      const savedAttribute = await manager.save(attribute);

      let values: GlobalAttributeValue[] = [];
      if (data['values']?.length) {
        const valuesEntities = data['values'].map((val) =>
          manager.create(GlobalAttributeValue, { ...val, attribute: savedAttribute }),
        );
        values = await manager.save(valuesEntities);
      }

      return {
        message: 'Attribut global créé avec succès.',
        data: { ...savedAttribute, values },
      };
    });
  }

  // 🔹 Récupérer tous les attributs
  async findAll() {
    const attributes = await this.globalAttrRepo.find({
      relations: ['values'],
      order: { createdAt: 'DESC' },
    });
    return {
      message: attributes.length
        ? 'Attributs récupérés avec succès.'
        : 'Aucun attribut trouvé.',
      data: attributes,
    };
  }

  // 🔹 Récupérer un attribut par ID
  async findOne(id: string) {
    const attribute = await this.globalAttrRepo.findOne({
      where: { id },
      relations: ['values'],
    });
    if (!attribute) throw new NotFoundException(`GlobalAttribute avec l'id ${id} introuvable`);
    return { message: 'Attribut récupéré avec succès.', data: attribute };
  }

  // 🔹 Mettre à jour un attribut global
  async update(id: string, data: UpdateGlobalAttributeDto) {
    const attribute = await this.globalAttrRepo.findOne({
      where: { id },
      relations: ['values'],
    });
    if (!attribute) throw new NotFoundException(`GlobalAttribute avec l'id ${id} introuvable`);

    // 🔹 Mettre à jour les champs simples
    if (data.key) attribute.key = data.key;
    if (data.label) attribute.label = data.label;
   
    if (data.unit !== undefined) attribute.unit = data.unit;
    if (data.options !== undefined) attribute.options = data.options;

    await this.globalAttrRepo.save(attribute);

    // 🔹 Mettre à jour les valeurs si présentes
    if (data.values?.length) {
      // Supprimer les anciennes valeurs
      if (attribute.values?.length) {
        const valueIds = attribute.values.map((v) => v.id);
        await this.globalAttrValueRepo.delete(valueIds);
      }

      // Créer les nouvelles valeurs
      const newValues: GlobalAttributeValue[] = [];
      for (const val of data.values) {
        const valueEntity = this.globalAttrValueRepo.create({
          value: val.value,
          attributeId: attribute.id,
        });
        newValues.push(await this.globalAttrValueRepo.save(valueEntity));
      }

      // Facultatif si tu veux retourner les nouvelles valeurs attachées
      attribute.values = newValues;
    }

    return {
      message: 'Attribut global mis à jour avec succès.',
      data: attribute,
    };
  }
  // 🔹 Supprimer un attribut global
  async remove(id: string) {
    const attribute = await this.globalAttrRepo.findOne({ where: { id } });
    if (!attribute) throw new NotFoundException(`GlobalAttribute avec l'id ${id} introuvable`);
    await this.globalAttrRepo.remove(attribute);
    return { message: 'Attribut supprimé avec succès.', data: null };
  }

  // 🔹 Supprimer une valeur spécifique
  async removeValue(valueId: string) {
    const value = await this.globalAttrValueRepo.findOne({ where: { id: valueId } });
    if (!value) throw new NotFoundException(`Valeur avec l'id ${valueId} introuvable`);
    await this.globalAttrValueRepo.remove(value);
    return { message: 'Valeur supprimée avec succès.', data: null };
  }
}
