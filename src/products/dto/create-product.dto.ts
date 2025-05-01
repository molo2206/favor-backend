import { IsString, IsNumber, IsOptional, IsUUID, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ProductStatus } from 'src/users/utility/common/product.status.enum';

export class CreateProductDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  price: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  durationInMinutes?: number;

  @IsOptional()
  @IsString()
  carModel?: string;

  @IsOptional()
  @IsString()
  licensePlate?: string;

  @IsOptional()
  @IsString()
  ingredients?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  stockQuantity?: number;

  @IsUUID()
  categoryId?: string;

  // Nouveaux champs pour les prix
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

  @IsEnum(ProductStatus)
  @IsOptional()
  status?: ProductStatus;

  @IsOptional()
  @IsString()
  measureId?: string;
}
