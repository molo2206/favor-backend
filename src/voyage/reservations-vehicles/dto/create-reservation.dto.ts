// create-reservation.dto.ts
import {
  IsUUID,
  IsOptional,
  IsArray,
  ValidateNested,
  IsString,
  IsNumber,
  Min,
  IsEnum,
  ValidateIf,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from 'src/operation/enum/payment-method.enum';
import { BaggageType } from 'src/voyage/baggage/enum/baggage-type.enum';
import { ReservationStatus } from '../enum/reservation-status.enum';
import { ReservationType } from '../entities/reservations-vehicle.entity';

// ============================================================
// DTO — Sièges passager (TRIP)
// ============================================================
export class PassengerSeatDto {
  @IsUUID()
  segmentId: string;

  @IsUUID()
  seatId: string;
}

// ============================================================
// DTO — Repas passager (TRIP)
// ============================================================
export class PassengerMealDto {
  @IsUUID()
  mealId: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsUUID()
  segment_id?: string;
}

// ============================================================
// DTO — Passager (TRIP)
// ============================================================
export class PassengerDto {
  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PassengerMealDto)
  meals?: PassengerMealDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PassengerSeatDto)
  seats: PassengerSeatDto[];
}

// ============================================================
// DTO — Mobile Money
// ============================================================
export class MobileMoneyDetailsDto {
  @IsString()
  providerId: string;

  @IsString()
  phone: string;
}

// ============================================================
// DTO — Bagage
// ============================================================
export class CreateBaggageDto {
  @IsEnum(BaggageType)
  baggageType: BaggageType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  weight?: number;

  @IsOptional()
  @IsString()
  dimensions?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  extraFee?: number;
}

// ============================================================
// DTO PRINCIPAL
// ============================================================
export class CreateReservationDto {
  // ============================================================
  // ✅ TYPE (TRIP ou VEHICLE)
  // ============================================================
  @IsOptional()
  @IsEnum(ReservationType)
  type?: ReservationType;

  // ============================================================
  // 🚌 CHAMPS TRIP (existants)
  // ============================================================

  // ✅ tripId devient optionnel (au lieu d'obligatoire)
  @ValidateIf((o) => o.type !== ReservationType.VEHICLE)
  @IsUUID()
  tripId?: string;

  @ValidateIf((o) => o.type !== ReservationType.VEHICLE)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PassengerDto)
  passengers?: PassengerDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBaggageDto)
  baggageList?: CreateBaggageDto[];

  // ============================================================
  // 🚗 CHAMPS VEHICLE (nouveaux)
  // ============================================================
  @ValidateIf((o) => o.type === ReservationType.VEHICLE)
  @IsUUID()
  productId?: string;

  @ValidateIf((o) => o.type === ReservationType.VEHICLE)
  @IsString()
  startDate?: string;

  @ValidateIf((o) => o.type === ReservationType.VEHICLE)
  @IsString()
  endDate?: string;

  // ============================================================
  // 💰 PAIEMENT ET STATUT
  // ============================================================
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @ValidateNested()
  @Type(() => MobileMoneyDetailsDto)
  mobileMoneyDetails?: MobileMoneyDetailsDto;

  @ValidateIf((o) => o.paymentMethod === PaymentMethod.FPAY)
  @IsString()
  pin?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @ValidateIf((o) => o.paymentMethod === PaymentMethod.FPAY)
  @IsString()
  phone?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalPrice?: number;

  @ValidateIf((o) => o.paymentMethod === PaymentMethod.FPAY)
  @IsString()
  @IsNotEmpty({ message: 'Le token d\'accès FPay est requis pour le paiement FPAY' })
  access_token?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalAmount?: number;

  @IsOptional()
  @IsEnum(ReservationStatus)
  status?: ReservationStatus;

  @IsOptional()
  @IsString()
  currency?: string;
}