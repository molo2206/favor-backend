import {
  IsEnum,
  IsOptional,
  IsUUID,
  ValidateIf,
  IsString,
  IsNumber,
  IsInt,
  Min,
} from 'class-validator';
import { ShipmentStatus } from '../enum/shipment.dto';
import { Transform, Type } from 'class-transformer';

/**
 * Boolean permissif (FormData safe)
 * Ne bloque JAMAIS l'update
 */
const softBoolean = () =>
  Transform(({ value }) => {
    if (value === true || value === 'true' || value === '1' || value === 1)
      return true;

    if (value === false || value === 'false' || value === '0' || value === 0)
      return false;

    return undefined;
  });

export class UpdateShipmentAdminDto {
  // -----------------------
  // User / Client
  // -----------------------

  @IsOptional()
  @IsUUID()
  userId?: string;

  @ValidateIf((o) => !o.userId)
  @IsOptional()
  @IsString()
  clientName?: string;

  @ValidateIf((o) => !o.userId)
  @IsOptional()
  @IsString()
  clientPhone?: string;

  // -----------------------
  // Status
  // -----------------------

  @IsOptional()
  @IsEnum(ShipmentStatus)
  status?: ShipmentStatus;

  // -----------------------
  // Flags (NE BLOQUENT PAS)
  // -----------------------

  @IsOptional()
  @softBoolean()
  pickupEnabled?: boolean;

  @IsOptional()
  @softBoolean()
  shippingEnabled?: boolean;

  @IsOptional()
  @softBoolean()
  deliveryEnabled?: boolean;

  // -----------------------
  // Pickup
  // -----------------------

  // ❌ SUPPRESSION de companyId (remplacé par les trois champs ci-dessous)
  // @IsNotEmpty()
  // @IsString()
  // companyId: string;

  @IsOptional()
  @IsUUID()
  pickupCompanyId?: string;

  @IsOptional()
  @IsUUID()
  shippingCompanyId?: string;

  @IsOptional()
  @IsUUID()
  deliveryCompanyId?: string;

  @IsOptional()
  @IsString()
  pickupFrom?: string;

  @IsOptional()
  @IsString()
  pickupTo?: string;

  @IsOptional()
  @IsString()
  pickupContactName?: string;

  @IsOptional()
  @IsString()
  pickupContactPhone?: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID()
  pickupTransportTypeId?: string;

  // -----------------------
  // Shipping
  // -----------------------

  @IsOptional()
  @IsString()
  shippingFrom?: string;

  @IsOptional()
  @IsString()
  shippingTo?: string;

  // -----------------------
  // Delivery
  // -----------------------

  @IsOptional()
  @IsString()
  deliveryAddressId?: string;

  // -----------------------
  // Package
  // -----------------------

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  external_quantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  weight?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  length?: number;

  @IsOptional()
  @IsString()
  dimensions?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  internal_quantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  value?: number;

  @IsOptional()
  @softBoolean()
  fragile?: boolean;

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
