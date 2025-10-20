import { IsString, IsNotEmpty, IsOptional, IsNumber, IsInt, IsObject } from 'class-validator';

export class CreateSkuDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsString()
  @IsOptional()
  skuCode?: string;

  @IsNumber()
  price: number;

  @IsInt()
  stock: number;

  @IsObject()
  attributesJson: Record<string, any>;

  @IsString()
  @IsOptional()
  imageUrl?: string;
}
