// src/shipments/dto/collect-shipment-response.dto.ts
import { Shipment } from '../entity/shipment.entity';
import { ShipmentStatus } from '../enum/shipment.dto';

export class CollectShipmentResponseDto {
  message?: string;
  data: Shipment;
  shipmentId?: string;
  amountCollected?: number;
  status?: ShipmentStatus;
  deliveryFrom?: string;
  deliveryTo?: string;
  deliveryAddressId?: string;
  deliveryPrice?: number;
  totalPrice?: number;
  amount?: number;
}
