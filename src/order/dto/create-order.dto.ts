import { IsArray, IsEnum, IsNumber, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateSubOrderDto } from 'src/sub_orders/dto/create-sub_order.dto';
import { CreateOrderItemDto } from 'src/order_items/dto/create-order_item.dto';

export class CreateOrderDto {
    @IsEnum(['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'])
    status: 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';

    @IsOptional()
    @IsNumber()
    totalAmount?: number;

    @IsArray()
    @Type(() => CreateOrderItemDto)  // Assurez-vous d'importer et de définir OrderItemDto pour les items
    orderItems?: CreateOrderItemDto[];

    @IsArray()
    @Type(() => CreateSubOrderDto)  // Assurez-vous que SubOrderDto est bien défini
    subOrders?: CreateSubOrderDto[];
}
