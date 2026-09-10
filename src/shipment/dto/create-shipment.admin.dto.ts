import {
  IsEnum,
  IsNotEmpty,
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

const softBoolean = () =>
  Transform(({ value }) => {
    if (value === true || value === 'true' || value === '1' || value === 1)
      return true;

    if (value === false || value === 'false' || value === '0' || value === 0)
      return false;

    // Toute autre valeur → ignorée
    return undefined;
  });

export class CreateShipmentAdminDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ValidateIf((o) => !o.userId)
  @IsNotEmpty()
  @IsString()
  clientName?: string;

  @ValidateIf((o) => !o.userId)
  @IsNotEmpty()
  @IsString()
  clientPhone?: string;

  @IsOptional()
  @IsString()
  fournisseurName?: string;

  @IsOptional()
  @IsString()
  fournisseurPhone?: string;


  @IsOptional()
  @IsEnum(ShipmentStatus)
  status?: ShipmentStatus = ShipmentStatus.PENDING;

  // -----------------------
  // Flags (FORMDATA SAFE)
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

  // ✅ PICKUP - Ajout du Transform pour les chaînes vides
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID()
  pickupCompanyId?: string;

  // ✅ SHIPPING - Ajout du Transform pour les chaînes vides
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID()
  shippingCompanyId?: string;

  // ✅ DELIVERY - Ajout du Transform pour les chaînes vides
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID()
  deliveryCompanyId?: string;

  // -----------------------
  // Pickup
  // -----------------------

  @ValidateIf((o) => o.pickupEnabled === true)
  @IsNotEmpty()
  @IsString()
  pickupFrom?: string;

  @ValidateIf((o) => o.pickupEnabled === true)
  @IsNotEmpty()
  @IsString()
  pickupTo?: string;

  @ValidateIf((o) => o.pickupEnabled === true)
  @IsNotEmpty()
  @IsString()
  pickupContactName?: string;

  @ValidateIf((o) => o.pickupEnabled === true)
  @IsNotEmpty()
  @IsString()
  pickupContactPhone?: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID()
  pickupTransportTypeId?: string;

  // -----------------------
  // Shipping
  // -----------------------

  @ValidateIf((o) => o.shippingEnabled === true)
  @IsNotEmpty()
  @IsString()
  shippingFrom?: string;

  @ValidateIf((o) => o.shippingEnabled === true)
  @IsNotEmpty()
  @IsString()
  shippingTo?: string;

  // -----------------------
  // Delivery
  // -----------------------

  // -----------------------
  // Package
  // -----------------------

  @IsNotEmpty()
  @IsString()
  description!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  external_quantity!: number;

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
  @IsString()
  whatsapp_number?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

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

  @IsOptional()
  @IsString()
  deliveryAddressId?: string;

  @IsOptional()
  @IsString()
  loyaltyCode?: string;

  @IsOptional()
  @IsString()
  loyaltyCodeFournisseur?: string;
}
