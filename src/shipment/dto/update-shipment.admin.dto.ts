import {
  IsEnum,
  IsOptional,
  IsUUID,
  ValidateIf,
  IsString,
  IsNumber,
  IsInt,
  Min,
  IsBoolean,
} from 'class-validator';
import { ShipmentStatus } from '../enum/shipment.dto';
import { Transform, Type } from 'class-transformer';

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

  @IsOptional()
  @IsString()
  clientName?: string;

  // ✅ SUPPRESSION du @ValidateIf((o) => !o.userId)
  @IsOptional()
  @IsString()
  clientPhone?: string;

  // -----------------------
  // Fournisseur
  // -----------------------

  @IsOptional()
  @IsString()
  supplierName?: string;

  @IsOptional()
  @IsString()
  supplierPhone?: string;

  // -----------------------
  // Status
  // -----------------------

  @IsOptional()
  @IsEnum(ShipmentStatus)
  status?: ShipmentStatus;

  // -----------------------
  // Flags
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

  // -----------------------
  // Prices
  // -----------------------

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  pickupPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  shippingPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  deliveryPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalPrice?: number;

  // -----------------------
  // WhatsApp
  // -----------------------

  @IsOptional()
  @IsString()
  whatsapp_number?: string;

  // -----------------------
  // Payment
  // -----------------------

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  // -----------------------
  // Loyalty
  // -----------------------

  @IsOptional()
  @IsString()
  loyaltyCode?: string;

  @IsOptional()
  @IsString()
  loyaltyCodeFournisseur?: string;

  // ============================================================
  // ✅ CORRECTION : Ajouter @softBoolean() à isPaid
  //    Sinon, "true"/"false" en string ne sont pas convertis
  // ============================================================
  @IsOptional()
  @softBoolean()
  isPaid?: boolean;

  // ============================================================
  // ✅ AJOUT : paid (alias de isPaid)
  // ============================================================
  @IsOptional()
  @softBoolean()
  paid?: boolean;
}