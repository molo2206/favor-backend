import { PartialType } from '@nestjs/mapped-types';
import { CreateShipmentDto } from './create-shipment.dto';
import { IsOptional, IsDateString, IsUUID } from 'class-validator';

export class UpdatesShipmentDto extends PartialType(CreateShipmentDto) {
  @IsOptional()
  @IsDateString()
  actualDeliveryDate?: Date;
}