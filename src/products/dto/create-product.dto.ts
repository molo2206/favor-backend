import { IsString, IsNumber, IsOptional, IsUUID, IsEnum, ValidateIf } from 'class-validator';
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
  quantity?: number;

  @IsUUID()
  categoryId?: string;

  // Nouveaux champs pour les prix
  @ValidateIf(o => o.detail_price_original !== undefined && o.detail_price_original !== '')
  @Type(() => Number)
  @IsNumber()
  detail_price_original?: number;

  @ValidateIf(o => o.gros_price_original !== undefined && o.gros_price_original !== '')
  @Type(() => Number)
  @IsNumber()
  gros_price_original?: number;

  @ValidateIf(o => o.detail !== undefined && o.detail !== '')
  @Type(() => Number)
  @IsNumber()
  detail?: number;

  @ValidateIf(o => o.gros !== undefined && o.gros !== '')
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
