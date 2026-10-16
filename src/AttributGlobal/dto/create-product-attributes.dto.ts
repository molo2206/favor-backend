import { IsArray, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class ProductAttributeItemDto {
  @IsString()
  attributeId: string;
}

export class CreateProductAttributesDto {
  @IsString()
  productId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductAttributeItemDto)
  attributes: ProductAttributeItemDto[];
}
