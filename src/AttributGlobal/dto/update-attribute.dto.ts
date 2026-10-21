import { PartialType } from '@nestjs/mapped-types';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsArray,
  MaxLength,
  IsInt,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AttributeType } from '../enum/attributeType.enum';
import { CreateAttributeValueDto } from './create-attribute-value.dto';

export class UpdateAttributeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsEnum(AttributeType, {
    message: `Le type doit être l'un des suivants : ${Object.values(AttributeType).join(', ')}`,
  })
  type?: AttributeType;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  isFilterable?: boolean;

  // ============================================================
  // ✅ NOUVEAUX CHAMPS
  // ============================================================

  /** Sert à créer des variations (le client choisit une valeur) */
  @IsOptional()
  @IsBoolean()
  isVariant?: boolean;

  /** Affiché sur la fiche produit */
  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Unité pour les attributs NUMBER (Go, kg, cm…) */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  unit?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categoryIds?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAttributeValueDto)
  values?: CreateAttributeValueDto[];
}
