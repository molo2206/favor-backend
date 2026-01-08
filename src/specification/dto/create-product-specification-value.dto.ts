// create-product-specification-value.dto.ts
import { IsString, IsOptional } from 'class-validator';

export class CreateProductSpecificationValueDto {
  @IsString()
  productId: string;

  @IsString()
  specificationId: string;

  @IsOptional()
  @IsString()
  value?: string;
}
