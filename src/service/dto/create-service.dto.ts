import { IsString, IsOptional, IsNumber, Min, IsArray, IsUUID, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ProductStatus } from 'src/products/enum/product.status.enum';

export class CreateServiceDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsUUID()
  categoryId: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Le prix doit être un nombre avec maximum 2 décimales' })
  @Min(0)
  price?: number; // Prix de base du service

  @IsOptional()
  @IsUUID()
  measureId?: string;
}
