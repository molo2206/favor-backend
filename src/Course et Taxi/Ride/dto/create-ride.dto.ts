import { IsNotEmpty, IsUUID, IsNumber, IsOptional, IsEnum, IsIn, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { RidePaymentMethod } from '../enum/ride-event.enum';

export class CreateRideDto {
 
  @IsUUID()
  @IsOptional()
  driverId?: string;

  @IsUUID()
  @IsNotEmpty()
  cityId: string;

  @IsUUID()
  @IsNotEmpty()
  categoryId: string;

  @IsNotEmpty()
  pickupLocation: { lat: number; lng: number; address?: string; placeId?: string };

  @IsNotEmpty()
  dropoffLocation: { lat: number; lng: number; address?: string; placeId?: string };

  @IsNumber()
  @IsOptional()
  distance?: number;

  @IsNumber()
  @IsOptional()
  duration?: number;

  @IsNumber()
  @IsOptional()
  price?: number;

  @IsNumber()
  @IsOptional()
  surgeMultiplier?: number;
  // ✅ AJOUT : moyen de paiement (CASH par défaut)
  @IsEnum(RidePaymentMethod)
  @IsOptional()
  paymentMethod?: RidePaymentMethod;

  // ✅ Frais de transaction et devise : calculés / choisis par le front (comme les commandes)
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  transactionFee?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  appliedFeeRate?: number;

  @IsOptional()
  @IsIn(['USD', 'CDF', 'XAF', 'XOF'])
  currency?: string;

  /** ✅ Moyen de paiement enregistré de l'utilisateur (Mobile Money, FPay, Cash) */
  @IsOptional()
  @IsUUID()
  paymentMethodId?: string;
}
