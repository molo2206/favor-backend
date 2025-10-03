import { IsString, IsNumber, IsOptional, IsUUID, IsEnum, IsNumberString } from 'class-validator';
import { Type } from 'class-transformer';
import { ProductStatus } from 'src/products/enum/product.status.enum';
import { Type_rental_both_sale_car } from '../enum/type_rental_both_sale_car';
import { FuelType } from '../enum/fuelType_enum';
import { Transmission } from '../enum/transmission.enum';

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
}
