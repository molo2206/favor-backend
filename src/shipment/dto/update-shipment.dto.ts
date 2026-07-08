import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsNumber,
  IsBoolean,
  IsUUID,
} from 'class-validator';

export class UpdateShipmentDto {
  // Sections
  @IsOptional() @IsBoolean() pickupEnabled?: boolean;
  @IsOptional() @IsBoolean() shippingEnabled?: boolean;
  @IsOptional() @IsBoolean() deliveryEnabled?: boolean;

  // Pickup
  @IsOptional() @IsString() pickupFrom?: string;
  @IsOptional() @IsString() pickupTo?: string;
  @IsOptional() @IsString() pickupContactName?: string;
  @IsOptional() @IsString() pickupContactPhone?: string;
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID()
  pickupTransportTypeId?: string;

  // Shipping
  @IsOptional() @IsString() shippingFrom?: string;
  @IsOptional() @IsString() shippingTo?: string;

  // Delivery
  @IsOptional() @IsString() deliveryAddressId?: string;

  // Payment & contact
  @IsOptional() @IsString() paymentMethod?: string;
  @IsOptional() @IsString() whatsapp_number?: string;

  // ❌ SUPPRESSION de companyId
  // ✅ AJOUT des compagnies
  @IsOptional() @IsUUID() pickupCompanyId?: string;
  @IsOptional() @IsUUID() shippingCompanyId?: string;
  @IsOptional() @IsUUID() deliveryCompanyId?: string;

  // Package
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() external_quantity?: number;
  @IsOptional() @IsNumber() weight?: number;
  @IsOptional() @IsNumber() length?: number;
  @IsOptional() @IsString() dimensions?: string;
  @IsOptional() @IsNumber() internal_quantity?: number;
  @IsOptional() @IsNumber() value?: number;
  @IsOptional() @IsBoolean() fragile?: boolean;
}
