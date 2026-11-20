import { IsOptional, IsNumber, Min, IsEnum } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { Matches } from 'class-validator';
import { CURRENCY_CODE, toCurrency } from '../shipment-currency';
import { ShipmentStatus } from '../enum/shipment.dto';

export class ShipmentPriceDto {
  // Prix pour le pickup (facultatif)
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  pickupPrice?: number;

  // Prix pour le shipping (facultatif)
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  shippingPrice?: number;

  // Prix pour la livraison finale (facultatif)
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  deliveryPrice?: number;

  // Total (facultatif, peut être calculé automatiquement côté backend)
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalPrice?: number;

  /** ✅ Devise des prix du colis (USD par défaut, ex. CDF) */
  @IsOptional()
  @Transform(toCurrency)
  @Matches(CURRENCY_CODE, { message: "Devise invalide (code ISO à 3 lettres : USD, CDF…)" })
  currency?: string;

  @IsOptional()
  @IsEnum(ShipmentStatus)
  status?: ShipmentStatus; 
}
