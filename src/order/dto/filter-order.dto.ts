import { IsOptional, IsIn } from 'class-validator';
import { OrderStatus } from '../enum/orderstatus.enum';

export class FilterOrderDto {
    @IsOptional()
    @IsIn(['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'])
    status?: OrderStatus;
}
