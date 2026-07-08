// src/shipments/dto/collect-shipment-body.dto.ts
import { IsOptional, IsString, IsNumber } from 'class-validator';

export class CollectShipmentBodyDto {
  @IsOptional()
  @IsString()
  deliveryFrom?: string;

  @IsOptional()
  @IsString()
  deliveryTo?: string;

  @IsOptional()
  @IsString()
  deliveryAddressId?: string;

  @IsOptional()
  @IsNumber()
  deliveryPrice?: number;

  @IsNumber()
  totalAmount: number; // montant envoyé à Pawapay

  @IsNumber()
  amount: number;

  @IsOptional()
  @IsString()
  currency: string; // ex: "USD"

  @IsOptional()
  @IsString()
  provider: string; // ex: "AIRTEL_COD"

  @IsOptional()
  @IsString()
  phone: string; // numéro pour paiement Pawapay
}
