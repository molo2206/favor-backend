// src/shipments/dto/collect-shipment-body-admin.dto.ts
import { IsNumber, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

export class CollectShipmentBodyAdminDto {
  @Type(() => Number)
  @IsNumber({}, { message: 'Le montant doit être un nombre.' })
  @IsNotEmpty({ message: 'Le montant est requis.' })
  amount: number;

  @IsNotEmpty({ message: 'Le mot de passe admin est requis.' })
  password: string;
}