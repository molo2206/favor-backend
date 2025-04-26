import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { DeliveryStatus } from '../enums/delivery.enum.status';

export class CreateDeliveryDto {
  @IsUUID()
  @IsNotEmpty()
  deliveryCompanyId: string;

  @IsUUID()
  @IsNotEmpty()
  livreurId: string;

  @IsUUID()
  @IsNotEmpty()
  orderId: string;

  @IsEnum(DeliveryStatus)
  @IsOptional()
  currentStatus?: DeliveryStatus;

  @IsString()
  @IsNotEmpty()
  deliveryAddress: string;

  @IsString()
  @IsOptional()
  deliveryNotes?: string;

  @IsString()
  @IsOptional()
  estimatedDeliveryTime?: string;
}
