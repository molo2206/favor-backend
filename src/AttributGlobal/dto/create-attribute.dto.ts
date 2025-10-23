import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AttributeType } from '../enum/attributeType.enum';
import { CreateAttributeValueDto } from './create-attribute-value.dto';

export class CreateAttributeDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  slug: string;

  @IsEnum(AttributeType)
  type: AttributeType;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  isFilterable?: boolean;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean; // si tu veux gérer la visibilité publique

  @IsOptional()
  position?: number;

  // Associations aux catégories
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categoryIds?: string[];

  // Valeurs de l'attribut
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAttributeValueDto)
  values?: CreateAttributeValueDto[];
}
