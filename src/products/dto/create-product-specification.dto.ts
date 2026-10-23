import { IsString, IsOptional, IsArray } from 'class-validator';

export class ProductSpecificationDto {
  @IsString()
  specificationId: string;

  @IsOptional()
  @IsString() // ou boolean selon ton design
  value?: string;
}