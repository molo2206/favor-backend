import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';

// ============================================================
// PRODUIT ↔ ATTRIBUTS
// ============================================================

/** Valeur autorisée d'un attribut pour un produit (ex : Couleur = Rouge) */
export class ProductAttributeValueInputDto {
  /** Valeur existante de l'attribut */
  @IsOptional()
  @IsUUID()
  attributeValueId?: string;

  /** Ou bien le texte de la valeur : elle est créée si elle n'existe pas encore */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  value?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;

  /** Supplément de prix pour cette valeur (produit sans variation) */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  priceAdjustment?: number;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position?: number;
}

/** Attribut lié à un produit */
export class ProductAttributeInputDto {
  @IsUUID()
  attributeId: string;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  isVariant?: boolean;

  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position?: number;

  /** Valeur libre pour TEXT / NUMBER / BOOLEAN (ex : "100% coton") */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  customValue?: string | null;

  /** Valeurs autorisées (Couleur : Rouge, Bleu…). Absent = valeurs inchangées. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductAttributeValueInputDto)
  values?: ProductAttributeValueInputDto[];
}

export class SyncProductAttributesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductAttributeInputDto)
  attributes: ProductAttributeInputDto[];

  /** true (défaut) : les attributs absents de la liste sont retirés du produit */
  @IsOptional()
  @IsBoolean()
  replace?: boolean;
}

// ============================================================
// VARIATIONS
// ============================================================

export class VariationAttributeValueInputDto {
  @IsUUID()
  attributeId: string;

  @IsOptional()
  @IsUUID()
  attributeValueId?: string;

  /** Texte de la valeur : créée si elle n'existe pas encore */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  value?: string;
}

export class ProductVariationInputDto {
  /** Présent = mise à jour de cette variation */
  @IsOptional()
  @IsUUID()
  id?: string;

  /** Généré automatiquement s'il est absent */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  sku?: string;

  /** Généré automatiquement ("Rouge / XL") s'il est absent */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  wholesalePrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  retailPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  weight?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  length?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  width?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  height?: number;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  imageId?: string | number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariationAttributeValueInputDto)
  attributeValues?: VariationAttributeValueInputDto[];
}

export class SyncProductVariationsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductVariationInputDto)
  variations: ProductVariationInputDto[];

  /** true (défaut) : les variations absentes de la liste sont supprimées (ou archivées si déjà commandées) */
  @IsOptional()
  @IsBoolean()
  replace?: boolean;
}

/** Trouver la variation qui correspond aux choix du client */
export class ResolveVariationDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariationAttributeValueInputDto)
  attributes: VariationAttributeValueInputDto[];
}

/** Générer toutes les combinaisons à partir des valeurs autorisées du produit */
export class GenerateVariationsDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  wholesalePrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  retailPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  skuPrefix?: string;

  /** Limiter la génération à certains attributs (par défaut : tous les attributs "variation" du produit) */
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  attributeIds?: string[];
}

// ============================================================
// CATÉGORIE ↔ ATTRIBUTS
// ============================================================

export class CategoryAttributeInputDto {
  @IsUUID()
  attributeId: string;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position?: number;
}

export class SyncCategoryAttributesDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CategoryAttributeInputDto)
  attributes: CategoryAttributeInputDto[];

  /** true (défaut) : les attributs absents de la liste sont retirés de la catégorie */
  @IsOptional()
  @IsBoolean()
  replace?: boolean;
}
