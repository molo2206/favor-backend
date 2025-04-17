import { IsString, IsNumber, IsOptional } from 'class-validator';

export class CreateSubOrderItemDto {
  @IsString()
  @IsOptional()  // Si vous ne voulez pas que cette propriété soit obligatoire
  subOrderId?: string;  // Lier l'élément à une sous-commande spécifique

  @IsString()
  productId: string;  // L'ID du produit associé à l'item

  @IsNumber()
  quantity: number;  // Quantité de l'élément

  @IsNumber()
  price: number;  // Prix de l'élément
}
