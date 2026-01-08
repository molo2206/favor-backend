import {
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
} from 'class-validator';
import {  PartialType } from '@nestjs/mapped-types';
import { CreateCategoryDto } from './create-category.dto';
import { SpecificationsDto } from './specification.dto';
import { Type } from 'class-transformer';

class AttributeDto {
  @IsString()
  attribute_id: string;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => SpecificationsDto)
  specifications?: SpecificationsDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttributeDto)
  attributes?: AttributeDto[];
}
