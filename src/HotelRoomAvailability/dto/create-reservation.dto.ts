import {
  IsUUID,
  IsDateString,
  IsInt,
  Min,
  IsOptional,
  IsNumber,
  IsEnum,
  IsString,
} from 'class-validator';
import { OrderStatus } from 'src/order/enum/order.status.enum';

export class CreateReservationDto {
  @IsUUID()
  productId: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsInt()
  @Min(1)
  adults: number;

  @IsInt()
  @Min(0)
  children: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  roomsBooked: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}
