// create-colis.dto.ts
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { ColisPickupPaymentTiming } from '../enum/colis-pickup.enum';
import { PaymentMethod } from 'src/operation/enum/payment-method.enum';

export class CreateColisDto {
  description: string;
  weight: number;
  value?: number;
  receiverId?: string;
  pickupAddress: any;
  dropAddress: any;
  photos?: string;
  whatsapp_number?: string;
  paymentMethod?: string;

  // ✅ RAMASSAGE — zone + prix (validé selon le poids) + moment du paiement
  /** Pays de ramassage (countries.id) — nécessaire pour calculer/valider le tarif */
  @IsOptional() @IsUUID() pickupCountryId?: string;

  /** Ville de ramassage (cities.id) — NULL = tarif par défaut du pays */
  @IsOptional() @IsUUID() pickupCityId?: string;

  /** Prix de ramassage saisi : doit correspondre au tarif pour ce poids.
   *  Si absent, il est calculé automatiquement depuis la table des tarifs. */
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) pickupPrice?: number;

  @IsOptional() @IsString() pickupCurrency?: string;

  /** Déjà payé au fournisseur, ou à payer pendant le ramassage */
  @IsOptional() @IsEnum(ColisPickupPaymentTiming) pickupPaymentTiming?: ColisPickupPaymentTiming;

  /** Si PAS encore payé : montant dû au fournisseur (réglé au ramassage) */
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) supplierAmountDue?: number;

  /** Mode de paiement prévu du ramassage (mêmes modes que les commandes) */
  @IsOptional() @IsEnum(PaymentMethod) pickupPaymentMethod?: PaymentMethod;
}
