import { IsArray, IsNotEmpty, IsNumber, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateOrderItemDto } from 'src/order-item/dto/create-order-item.dto';

export class CreateOrderDto {
    @IsNumber()
    @IsNotEmpty()
    totalAmount: number;
  
    @IsNumber()
    @IsNotEmpty()
    shippingCost: number;
  
    @IsNotEmpty()
    addressUserId: string;

    @IsNumber()
    latitude: number;

    @IsNumber()
    longitude: number;

    @IsString()
    @IsNotEmpty()
    currency: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateOrderItemDto)
    orderItems: CreateOrderItemDto[];
}
