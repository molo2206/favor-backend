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
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ProductStatus } from 'src/products/enum/product.status.enum';
import { Type_rental_both_sale_car } from '../enum/type_rental_both_sale_car';
import { FuelType } from '../enum/fuelType_enum';
import { Transmission } from '../enum/transmission.enum';
import { ProductSpecificationDto } from './create-product-specification.dto';

export class CreateProductDto {
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

  @IsString()
  type: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductAttributeDto)
  attributes?: ProductAttributeDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SkuDto)
  skus?: SkuDto[];
}

class AttributeValueDto {
  @IsString()
  value: string;
}

class ProductAttributeDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttributeValueDto)
  values?: AttributeValueDto[];
}

class SkuDto {
  @IsOptional()
  @IsString()
  skuCode?: string;

  @IsNumber()
  price: number;

  @IsInt()
  stock: number;

  @IsOptional()
  attributesJson?: Record<string, string>;

  @IsOptional()
  @IsString()
  imageUrl?: string;
}
