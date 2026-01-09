import { IsOptional, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

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
}
