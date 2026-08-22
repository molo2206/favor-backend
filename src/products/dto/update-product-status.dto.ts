// src/products/dto/update-product-status.dto.ts
import { IsEnum } from 'class-validator';
import { ProductStatus } from 'src/products/enum/product.status.enum';

export class UpdateProductStatusDto {
    @IsEnum(ProductStatus, { message: 'Statut invalide' })
    status: ProductStatus;
}
