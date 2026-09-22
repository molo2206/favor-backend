import { IsNotEmpty, IsOptional, IsUUID, IsEnum, IsString } from 'class-validator';
import { ShipmentStatus } from '../enum/shipment.dto';

export class CreateShipmentTrackingDto {
  @IsUUID()
  @IsNotEmpty()
  shipmentId: string;

  @IsEnum(ShipmentStatus)
  @IsNotEmpty()
  status: ShipmentStatus;

  @IsUUID()
  @IsOptional()
  transportTypeId?: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsString()
  @IsOptional()
  comment?: string;
}
