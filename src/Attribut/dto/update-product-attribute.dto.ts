import { PartialType } from '@nestjs/mapped-types';
import { CreateProductAttributeDto } from './create-product-attribute.dto';
import { IsArray, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { UpdateProductAttributeValueDto } from './update-product-attribute.value.dto';

export class UpdateProductAttributeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsUUID()
  globalAttrId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateProductAttributeValueDto)
  values?: UpdateProductAttributeValueDto[];
}
