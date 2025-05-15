import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { DeliveryStatus } from '../enums/delivery.enum.status';

export class CreateDeliveryDto {
  @IsUUID()
  @IsNotEmpty()
  deliveryCompanyId: string;

  @IsNotEmpty()
  @IsString()
  invoiceNumber: string;

  @IsEnum(DeliveryStatus)
  @IsOptional()
  currentStatus?: DeliveryStatus;

  @IsString()
  @IsOptional()
  deliveryNotes?: string;

  @IsString()
  @IsOptional()
  estimatedDeliveryTime?: string;
}
