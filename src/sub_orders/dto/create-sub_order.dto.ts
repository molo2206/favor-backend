import { IsDateString, ValidateNested, IsArray, IsOptional, IsNumber, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateSubOrderItemDto } from 'src/sub_order_items/dto/create-sub_order_item.dto';

export class CreateSubOrderDto {
  @IsDateString()
  deliveryDate: string;

  @IsOptional()
  @IsNumber()
  subtotal?: number;

  @IsOptional()
  @IsEnum(['pending', 'confirmed', 'in_progress', 'completed'])
  status?: 'pending' | 'confirmed' | 'in_progress' | 'completed';

  @IsOptional()
  orderId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSubOrderItemDto)
  items: CreateSubOrderItemDto[];
}
