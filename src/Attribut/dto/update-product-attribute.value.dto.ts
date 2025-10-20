import { PartialType } from '@nestjs/mapped-types';
import { IsUUID } from 'class-validator';
import { CreateProductAttributeDto } from './create-product-attribute.dto';

export class UpdateProductAttributeValueDto extends PartialType(CreateProductAttributeDto) {
  @IsUUID()
  id: string; // obligatoire pour identifier quelle valeur mettre à jour
}
