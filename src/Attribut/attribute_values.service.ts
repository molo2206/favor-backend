import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AttributeValue } from './entities/attribute_values.entity';
import { ProductAttribute } from './entities/product_attributes.entity';

@Injectable()
export class AttributeValueService {
  constructor(
    @InjectRepository(AttributeValue)
    private readonly attrValueRepo: Repository<AttributeValue>,

    @InjectRepository(ProductAttribute)
    private readonly productAttrRepo: Repository<ProductAttribute>,
  ) {}

  // 🔹 Créer une valeur d'attribut
  async create(data: Partial<AttributeValue>) {
    const attribute = await this.productAttrRepo.findOne({
      where: { id: data.attributeId },
    });
    if (!attribute) throw new NotFoundException('ProductAttribute not found');

    const value = this.attrValueRepo.create({ ...data, attribute });
    const saved = await this.attrValueRepo.save(value);

    return { message: 'AttributeValue created successfully', data: saved };
  }

  // 🔹 Récupérer toutes les valeurs d'un attribut
  async findByAttribute(attributeId: string) {
    const values = await this.attrValueRepo.find({
      where: { attributeId },
      relations: ['attribute'],
    });

    return { message: 'AttributeValues retrieved successfully', data: values };
  }

  // 🔹 Récupérer une valeur par ID
  async findOne(id: string) {
    const value = await this.attrValueRepo.findOne({
      where: { id },
      relations: ['attribute'],
    });
    if (!value) throw new NotFoundException(`AttributeValue with id ${id} not found`);

    return { message: 'AttributeValue retrieved successfully', data: value };
  }

  // 🔹 Mettre à jour une valeur
  async update(id: string, data: Partial<AttributeValue>) {
    const value = await this.attrValueRepo.findOne({
      where: { id },
      relations: ['attribute'],
    });
    if (!value) throw new NotFoundException(`AttributeValue with id ${id} not found`);

    Object.assign(value, data);
    const updated = await this.attrValueRepo.save(value);

    return { message: 'AttributeValue updated successfully', data: updated };
  }

  // 🔹 Supprimer une valeur
  async remove(id: string) {
    const value = await this.attrValueRepo.findOne({
      where: { id },
      relations: ['attribute'],
    });
    if (!value) throw new NotFoundException(`AttributeValue with id ${id} not found`);

    await this.attrValueRepo.remove(value);
    return { message: 'AttributeValue deleted successfully', data: null };
  }
}
