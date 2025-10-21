import { IsOptional, IsString, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { SpecificationsDto } from './specification.dto';

class AttributeDto {
  @IsString()
  attribute_id: string;
}

export class CreateCategoryDto {
  @IsString()
  name: string;

  @IsOptional()
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

  // 🔹 Ajouter les attributs globaux
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttributeDto)
  attributes?: AttributeDto[];
}
