import { IsEnum } from 'class-validator';
import { ProductStatus } from 'src/products/enum/product.status.enum';

export class UpdateServiceStatusDto {
  @IsEnum(ProductStatus)
  status: ProductStatus;
}
