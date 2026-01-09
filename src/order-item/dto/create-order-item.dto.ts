import { IsUUID, IsInt, Min, IsNumber, IsNotEmpty } from 'class-validator';

export class CreateOrderItemDto {
  @IsUUID()
  productId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsNumber()
  @IsNotEmpty()
  price: number;
}
