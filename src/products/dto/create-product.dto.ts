import { IsString, IsNumber, IsOptional, IsUUID, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ProductStatus } from 'src/products/enum/product.status.enum';

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
  carModel?: string;

  @IsOptional()
  @IsString()
  licensePlate?: string;

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
  durationInMinutes?: number;

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

}
