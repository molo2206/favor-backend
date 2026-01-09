import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { DeliveryStatus } from '../enums/delivery.enum.status';

export class CreateDeliveryDto {
  
  @IsOptional()
  @IsString()
  invoiceNumber: string;

  @IsEnum(DeliveryStatus)
  @IsOptional()
  status?: DeliveryStatus;

  @IsString()
  @IsOptional()
  deliveryNotes?: string;

  @IsUUID()
  @IsNotEmpty()
  livreurId: string;

  @IsString()
  @IsOptional()
  estimatedDeliveryTime?: string;
}
