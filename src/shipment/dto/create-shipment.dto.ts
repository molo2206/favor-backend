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
import { Matches } from 'class-validator';
import { CURRENCY_CODE, toCurrency } from '../shipment-currency';
import { ShipmentStatus } from '../enum/shipment.dto';
import { ShipmentPickupPaymentTiming } from '../enum/shipment-pickup.enum';
import { PaymentMethod } from 'src/operation/enum/payment-method.enum';
import { Transform, Type } from 'class-transformer';

export class CreateShipmentDto {
  /** ✅ Devise des prix du colis (USD par défaut, ex. CDF) */
  @IsOptional()
  @Transform(toCurrency)
  @Matches(CURRENCY_CODE, { message: "Devise invalide (code ISO à 3 lettres : USD, CDF…)" })
  currency?: string;

  @IsOptional()
  @IsEnum(ShipmentStatus)
  status?: ShipmentStatus = ShipmentStatus.PENDING;

  // Flags optionnels — en multipart/form-data ils arrivent en texte ("true"/"false")
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  pickupEnabled?: boolean = false;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  shippingEnabled?: boolean = false;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
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
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  fragile?: boolean;

  @IsOptional()
  @IsString()
  deliveryAddressId?: string;

  // -----------------------
  // ✅ RAMASSAGE tarifé (même logique que les colis)
  // -----------------------
  /** Pays de ramassage (countries.id) — pour calculer/valider le tarif selon le poids */
  @IsOptional() @IsUUID() pickupCountryId?: string;

  /** Ville de ramassage (cities.id) — NULL = tarif par défaut du pays */
  @IsOptional() @IsUUID() pickupCityId?: string;

  /** Prix de ramassage saisi : doit correspondre au tarif pour ce poids (sinon calculé) */
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) pickupPrice?: number;

  @IsOptional() @IsString() pickupCurrency?: string;

  /** Déjà payé au fournisseur, ou à payer pendant le ramassage */
  @IsOptional() @IsEnum(ShipmentPickupPaymentTiming) pickupPaymentTiming?: ShipmentPickupPaymentTiming;

  /** Si PAS encore payé : montant dû au fournisseur (réglé au ramassage) */
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) supplierAmountDue?: number;

  /** Mode de paiement du ramassage (mêmes modes que les commandes).
   *  Si FPAY ou MOBILE_MONEY : le frais est débité à la création et le shipment
   *  n'est créé QUE si le paiement passe (comme les commandes). */
  @IsOptional() @IsEnum(PaymentMethod) pickupPaymentMethod?: PaymentMethod;

  /** F-Pay : token du portefeuille du payeur (requis si pickupPaymentMethod = FPAY) */
  @IsOptional() @IsString() pickupAccessToken?: string;

  /** Mobile Money : opérateur + numéro (requis si pickupPaymentMethod = MOBILE_MONEY) */
  @IsOptional() @IsString() pickupProvider?: string;
  @IsOptional() @IsString() pickupPhone?: string;
}
