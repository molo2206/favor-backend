import {
  IsString,
  IsNumber,
  IsOptional,
  IsUUID,
  IsEnum,
  IsNumberString,
  IsArray,
  ValidateNested,
  IsInt,
  Min,
  IsBoolean,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ProductStatus } from 'src/products/enum/product.status.enum';
import { Type_rental_both_sale_car } from '../enum/type_rental_both_sale_car';
import { FuelType } from '../enum/fuelType_enum';
import { Transmission } from '../enum/transmission.enum';
import { ProductSpecificationDto } from './create-product-specification.dto';
import { BedType } from 'src/room/enum/bedtype.enum';
import { BedTypes } from '../enum/bedtypes.enum';

// DTO pour les valeurs d'attributs des variations
export class VariationAttributeValueDto {
  // ✅ Texte de la valeur (créée si elle n'existe pas) — ou bien attributeValueId
  @IsOptional()
  @IsString()
  value?: string;

  // ✅ NOUVEAU : id d'une valeur existante de l'attribut
  @IsOptional()
  @IsUUID()
  attributeValueId?: string;

  @IsString()
  attributeId: string;
}

// ✅ NOUVEAU : valeur autorisée d'un attribut pour le produit
export class ProductAttributeValueItemDto {
  @IsOptional()
  @IsUUID()
  attributeValueId?: string;

  @IsOptional()
  @IsString()
  value?: string;

  @IsOptional()
  @IsNumber()
  priceAdjustment?: number;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}

// ✅ NOUVEAU : attribut lié au produit (nouveau format, l'ancien ["uuid"] reste accepté)
export class ProductAttributeItemDto {
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
  @IsInt()
  @Min(0)
  position?: number;

  @IsOptional()
  @IsString()
  customValue?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductAttributeValueItemDto)
  values?: ProductAttributeValueItemDto[];
}

// DTO pour les variations de produit
export class CreateProductVariationDto {
  // ✅ NOUVEAU : présent = mise à jour de la variation existante (elle n'est plus recréée)
  @IsOptional()
  @IsUUID()
  id?: string;

  // ✅ NOUVEAU : libellé ("Rouge / XL"), généré automatiquement s'il est absent
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  imageId?: string;

  // ✅ Généré automatiquement s'il est absent
  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

  // ✅ Optionnels : prix du produit par défaut
  @IsOptional()
  @IsNumber()
  @Min(0)
  wholesalePrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  retailPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stock?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  weight?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  length?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  width?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  height?: number;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariationAttributeValueDto)
  attributeValues?: VariationAttributeValueDto[];
}

export class CreateProductDto {
  // Obligatoire
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  slug?: string;

  // Optionnels - Texte
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  ingredients?: string;

  @IsOptional()
  @IsString()
  localization?: string;

  // Optionnels - Nombres
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  quantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  min_quantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  stockAlert?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  detail_price_original?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  gros_price_original?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  detail?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  gros?: number;

  // Optionnels - Relations
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  brandId?: string;

  @IsOptional()
  @IsString()
  measureId?: string;

  // Statut du produit
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @IsOptional()
  @IsString()
  model: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @IsEnum(Type_rental_both_sale_car)
  typecar?: Type_rental_both_sale_car | null;

  @IsOptional()
  @IsString()
  year: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  dailyRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  dailyRate_price_original?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumberString()
  salePrice?: number;

  @IsOptional()
  @IsString()
  fuelType?: FuelType;

  @IsOptional()
  @IsString()
  transmission?: Transmission;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumberString()
  capacityAdults?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumberString()
  capacityChildren?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumberString()
  capacityTotal?: number;

  @IsOptional()
  @IsEnum(BedTypes)
  bedTypes?: BedTypes;

  @IsOptional()
  @IsArray()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  })
  specifications?: ProductSpecificationDto[];

  @IsOptional()
  @IsArray()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  })
  // ✅ ["uuid", …] (ancien format) ou [{ attributeId, isRequired, values: [...] }] (nouveau)
  attributes?: Array<string | ProductAttributeItemDto>;

  // ✅ NOUVEAU: Variations du produit
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductVariationDto)
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  })
  variations?: CreateProductVariationDto[];

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  halfDayRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  hourlyRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  weeklyRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  monthlyRate?: number;

  // ============================================================
  // 🚗 TARIFS PAR LOCALISATION
  // ============================================================
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  interiorCityRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  exteriorCityRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  pricePerKmExterior?: number;

  // ============================================================
  // 🚗 TARIF ÉVÉNEMENTIEL
  // ============================================================
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  eventRate?: number;

  // ============================================================
  // 🚗 CARACTÉRISTIQUES
  // ============================================================
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  seats?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  doors?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  airConditioning?: boolean;
}
