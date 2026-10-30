import { Type } from 'class-transformer';
import {
  IsIn,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { RidePaymentMethod } from '../enum/ride-event.enum';

export class RidePointDto {
  @Type(() => Number) @IsLatitude() lat: number;
  @Type(() => Number) @IsLongitude() lng: number;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsString() @MaxLength(255) placeId?: string;
}

/** Estimation du prix par catégorie avant de commander */
export class RideEstimateDto {
  @IsUUID() cityId: string;

  @ValidateNested() @Type(() => RidePointDto) pickupLocation: RidePointDto;
  @ValidateNested() @Type(() => RidePointDto) dropoffLocation: RidePointDto;

  /** Distance (km ou m) et durée (min ou s) renvoyées par Google — optionnelles */
  @IsOptional() @Type(() => Number) @IsNumber() distance?: number;
  @IsOptional() @Type(() => Number) @IsNumber() duration?: number;

  /** Limiter à une catégorie */
  @IsOptional() @IsUUID() categoryId?: string;

  /** ✅ Devise d'affichage choisie (prix converti par le serveur) */
  @IsOptional() @IsIn(['USD', 'CDF', 'XAF', 'XOF']) currency?: string;
}

/** ✅ Paiement de la course par le passager (après la course) */
export class PayRideDto {
  /** Par défaut : le mode choisi à la commande */
  @IsOptional() @IsEnum(RidePaymentMethod) paymentMethod?: RidePaymentMethod;
  /** Mobile Money : opérateur (VODACOM_MPESA_COD, AIRTEL_COD, ORANGE_COD…) et numéro */
  @IsOptional() @IsString() @MaxLength(60) provider?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  /** FPay : jeton du portefeuille du passager */
  @IsOptional() @IsString() access_token?: string;
  /** ✅ Frais de transaction calculés par le front (remplacent ceux de la commande) */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) transactionFee?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) appliedFeeRate?: number;
  /** ✅ Montant de la course envoyé par le front, dans la devise `currency` (comme les commandes) */
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) price?: number;
  /** ✅ Devise envoyée par le front */
  @IsOptional() @IsIn(['USD', 'CDF', 'XAF', 'XOF']) currency?: string;
  /** ✅ Moyen de paiement enregistré : remplit mode, opérateur, numéro */
  @IsOptional() @IsUUID() paymentMethodId?: string;
}

/** ✅ Changer le mode de paiement avant de payer */
export class ChangeRidePaymentMethodDto {
  @IsEnum(RidePaymentMethod) paymentMethod: RidePaymentMethod;
  /** ✅ Frais de transaction du nouveau mode, calculés par le front (0 si absent) */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) transactionFee?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) appliedFeeRate?: number;
  /** ✅ Montant de la course envoyé par le front, dans la devise `currency` (comme les commandes) */
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) price?: number;
  @IsOptional() @IsIn(['USD', 'CDF', 'XAF', 'XOF']) currency?: string;
}

/** ✅ Confirmation d'un paiement hors application (chauffeur : espèces / carte ; admin : tous) */
export class ConfirmRidePaymentDto {
  @IsOptional() @IsEnum(RidePaymentMethod) paymentMethod?: RidePaymentMethod;
  /** ✅ Frais de transaction si le mode change (envoyés par le front) */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) transactionFee?: number;
  @IsOptional() @IsString() @MaxLength(100) reference?: string;
}

export class RejectRideDto {
  @IsOptional() @IsString() @MaxLength(255) reason?: string;
}

export class CancelRideDto {
  @IsOptional() @IsString() @MaxLength(500) cancellationReason?: string;
}

export class CompleteRideDto {
  /** Distance réellement parcourue (km ou m) et durée réelle (min ou s) — optionnelles */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) distance?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) duration?: number;
  @IsOptional() @IsEnum(RidePaymentMethod) paymentMethod?: RidePaymentMethod;
}

export class RateRideDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(5) rating: number;
  @IsOptional() @IsString() @MaxLength(500) comment?: string;
}

export class DriverPositionDto {
  @Type(() => Number) @IsLatitude() lat: number;
  @Type(() => Number) @IsLongitude() lng: number;
  @IsOptional() @Type(() => Number) @IsNumber() heading?: number;
  @IsOptional() @Type(() => Number) @IsNumber() speed?: number;
}

export class RideHistoryQueryDto {
  /** rider (mes courses comme passager) | driver (mes courses comme chauffeur) */
  @IsOptional() @IsString() as?: 'rider' | 'driver';
  @IsOptional() @IsString() status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
}
