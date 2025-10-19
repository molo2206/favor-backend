import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductSpecificationValue } from './entities/ProductSpecificationValue.entity';
import { CreateProductSpecificationValueDto } from './dto/create-product-specification-value.dto';

@Injectable()
export class ProductSpecificationValueService {
  constructor(
    @InjectRepository(ProductSpecificationValue)
    private readonly psValueRepo: Repository<ProductSpecificationValue>,
  ) {}

  async create(dto: CreateProductSpecificationValueDto) {
    // Vérifie si une valeur existe déjà pour ce produit et cette spécification
    const existing = await this.psValueRepo.findOne({
      where: { productId: dto.productId, specificationId: dto.specificationId },
    });

    if (existing && dto.value !== undefined) {
      existing.value = dto.value;
      const updated = await this.psValueRepo.save(existing);
      return { message: 'Valeur de spécification mise à jour avec succès', data: updated };
    }

    const newValue = this.psValueRepo.create(dto);
    const saved = await this.psValueRepo.save(newValue);
    return { message: 'Valeur de spécification créée avec succès', data: saved };
  }

  async findByProduct(productId: string) {
    const values = await this.psValueRepo.find({
      where: { productId },
      relations: ['specification'],
    });

    if (!values.length) {
      throw new NotFoundException(
        `Aucune valeur de spécification trouvée pour le produit ${productId}`,
      );
    }

    return { message: 'Valeurs de spécifications récupérées avec succès', data: values };
  }

  async removeAllValuesFromProduct(productId: string) {
    await this.psValueRepo.delete({ productId });
    return { message: 'Toutes les valeurs de spécifications supprimées pour ce produit' };
  }
}
