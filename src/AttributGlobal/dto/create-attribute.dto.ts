import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsArray,
  MaxLength,
  IsInt,
  Min,
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
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position?: number;


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
