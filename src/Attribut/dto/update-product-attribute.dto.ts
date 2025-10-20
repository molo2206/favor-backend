import { PartialType } from '@nestjs/mapped-types';
import { CreateProductAttributeDto } from './create-product-attribute.dto';
import { IsArray, IsOptional, ValidateNested } from 'class-validator';
import { UpdateProductAttributeValueDto } from './update-product-attribute.value.dto';
import { Type } from 'class-transformer';

export class UpdateProductAttributeDto extends PartialType(CreateProductAttributeDto) {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateProductAttributeValueDto)
  values?: UpdateProductAttributeValueDto[];
}
