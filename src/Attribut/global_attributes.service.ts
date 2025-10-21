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
      let optionsArray: string[] | undefined = undefined;
      if (data.options) {
        optionsArray = data.options.split(',').map((opt) => opt.trim());
      }

      const attribute = manager.create(GlobalAttribute, {
        key: data.key,
        label: data.label,
        type: data.type,
        options: optionsArray, // sauvegarde en JSON
      });

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
    const attribute = await this.globalAttrRepo.findOne({
      where: { id },
    });
    if (!attribute) throw new NotFoundException(`GlobalAttribute avec l'id ${id} introuvable`);

    if (data.key) attribute.key = data.key;
    if (data.label) attribute.label = data.label;
    if (data.options !== undefined) attribute.options = data.options;

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
}
