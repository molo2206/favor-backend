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
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ProductStatus } from 'src/products/enum/product.status.enum';
import { Type_rental_both_sale_car } from '../enum/type_rental_both_sale_car';
import { FuelType } from '../enum/fuelType_enum';
import { Transmission } from '../enum/transmission.enum';
import { ProductSpecificationDto } from './create-product-specification.dto';
import { Optional } from '@nestjs/common';

// DTO pour les valeurs d'attributs des variations
export class VariationAttributeValueDto {
  @IsString()
  value: string;

  @IsString()
  attributeId: string;
}

// DTO pour les variations de produit
export class CreateProductVariationDto {
  @IsOptional()
  @IsString()
  imageId?: string;

  @IsString()
  sku: string;

  @IsNumber()
  @Min(0)
  wholesalePrice: number;

  @IsNumber()
  @Min(0)
  retailPrice: number;

  @IsNumber()
  @Min(0)
  stock: number;

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

export class CreateProductAdminDto {
  // Obligatoire
  @IsString()
  name: string;

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
  @IsString()
  bedTypes?: string;

  @IsOptional()
  @IsUUID()
  brandId?: string;

  @Optional()
  @IsUUID()
  companyId?: string;

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
  brand: string;

  @IsOptional()
  @IsString()
  model: string;

  @IsOptional()
  @IsString()
  typecar?: Type_rental_both_sale_car;

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
  @IsUUID('all', { each: true })
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
  attributes?: string[];

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
}
