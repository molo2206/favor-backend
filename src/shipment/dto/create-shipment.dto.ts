import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsUUID, ValidateIf, IsString, IsNumber, IsInt, Min } from 'class-validator';
import { ShipmentStatus } from '../enum/shipment.dto';
import { Type } from 'class-transformer';

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

  @ValidateIf((o) => o.pickupEnabled === true)
  @IsNotEmpty()
  @IsString()
  pickupContactPhone?: string;

  @ValidateIf((o) => o.pickupEnabled === true)
  @IsNotEmpty()
  @IsUUID()
  pickupTransportTypeId?: string;

  // Champs conditionnels pour shipping
  @ValidateIf((o) => o.shippingEnabled === true)
  @IsNotEmpty()
  @IsString()
  shippingFrom?: string;

  @ValidateIf((o) => o.shippingEnabled === true)
  @IsNotEmpty()
  @IsString()
  shippingTo?: string;

  @ValidateIf((o) => o.shippingEnabled === true)
  @IsNotEmpty()
  @IsUUID()
  shippingTransportTypeId?: string;

  // Champs conditionnels pour delivery
  @ValidateIf((o) => o.deliveryEnabled === true)
  @IsNotEmpty()
  @IsString()
  deliveryFrom?: string;

  @ValidateIf((o) => o.deliveryEnabled === true)
  @IsNotEmpty()
  @IsString()
  deliveryTo?: string;

  @ValidateIf((o) => o.deliveryEnabled === true)
  @IsNotEmpty()
  @IsString()
  deliveryContactName?: string;

  @ValidateIf((o) => o.deliveryEnabled === true)
  @IsNotEmpty()
  @IsString()
  deliveryContactPhone?: string;

  @ValidateIf((o) => o.deliveryEnabled === true)
  @IsNotEmpty()
  @IsUUID()
  deliveryTransportTypeId?: string;

  // -----------------------
  // Package (au même niveau)
  // -----------------------
  @IsNotEmpty()
  @IsString()
  description: string;

  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  external_quantity: number;

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
  @IsBoolean()
  fragile?: boolean;
}
