import {
  IsBoolean,
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

export class CreateShipmentDto {
  @IsOptional()
  @IsEnum(ShipmentStatus)
  status?: ShipmentStatus = ShipmentStatus.PENDING;

  // Flags optionnels
  @IsOptional()
  @IsBoolean()
  pickupEnabled?: boolean = false;

  @IsOptional()
  @IsBoolean()
  shippingEnabled?: boolean = false;

  @IsOptional()
  @IsBoolean()
  deliveryEnabled?: boolean = false;

  // Champs conditionnels pour pickup
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

  @IsNotEmpty()
  @IsString()
  description!: string;

  @ValidateIf((o) => o.pickupEnabled === true)
  @IsNotEmpty()
  @IsString()
  pickupContactPhone?: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID()
  pickupTransportTypeId?: string;

  @ValidateIf((o) => o.shippingEnabled === true)
  @IsNotEmpty()
  @IsString()
  shippingFrom?: string;

  @ValidateIf((o) => o.shippingEnabled === true)
  @IsNotEmpty()
  @IsString()
  shippingTo?: string;

  // -----------------------
  // Package (au même niveau)
  // -----------------------
  // ✅ PICKUP - Permet les chaînes vides
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID()
  pickupCompanyId?: string;

  // ✅ SHIPPING - Permet les chaînes vides
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID()
  shippingCompanyId?: string;

  // ✅ DELIVERY - Permet les chaînes vides
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID()
  deliveryCompanyId?: string;

  @IsNotEmpty()
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
  @IsBoolean()
  fragile?: boolean;

  @IsOptional()
  @IsString()
  deliveryAddressId?: string;
}
