import { PartialType } from '@nestjs/mapped-types';
import { CreateShipmentTrackingDto } from './create-shipment-tracking.dto';

export class UpdateShipmentTrackingDto extends PartialType(CreateShipmentTrackingDto) {}
