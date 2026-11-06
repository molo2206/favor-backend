// src/lta/dto/create-lta-shipment.dto.ts
import { IsString, IsArray, ArrayNotEmpty, IsUUID } from 'class-validator';

export class CreateLtaShipmentDto {
  @IsString()
  @IsUUID() // si tes LTAId sont des UUIDs
  ltaId: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true }) // chaque élément doit être un UUID
  shipments: string[];
}
