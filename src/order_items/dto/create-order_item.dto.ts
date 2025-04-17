import { IsNotEmpty, IsUUID, IsInt, Min } from 'class-validator';

export class CreateOrderItemDto {
  @IsUUID()
  @IsNotEmpty()
  orderId: string;  // ID de la commande à laquelle appartient l'item

  @IsUUID()
  @IsNotEmpty()
  productId: string;  // ID du produit associé à l'item

  @IsInt()
  @Min(1)
  quantity: number;  // Quantité du produit dans cet item
}
