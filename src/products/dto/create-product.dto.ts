import { IsString, IsNumber, IsOptional, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @Type(() => Number)
  @IsNumber()
  price: number;

  @IsString()
  type: string;

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
  companyId: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;
}
