// create-category-attribute.dto.ts
import { IsUUID, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class AttributeItemDto {
  @IsUUID()
  attribute_id: string;
}

export class CreateCategoryAttributeDto {
  @IsUUID()
  category_id: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttributeItemDto)
  attributes: AttributeItemDto[];
}
