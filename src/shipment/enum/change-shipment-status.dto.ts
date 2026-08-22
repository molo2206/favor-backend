// src/shipments/dto/change-shipment-status.dto.ts
import { IsEnum } from 'class-validator';
import { ShipmentStatus } from '../enum/shipment.dto';

export class ChangeShipmentStatusDto {
  @IsEnum(ShipmentStatus)
  status: ShipmentStatus;
}
