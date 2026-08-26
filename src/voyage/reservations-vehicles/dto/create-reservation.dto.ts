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

// DTO pour un siège par passager
export class PassengerSeatDto {
  @IsUUID()
  segmentId: string;

  @IsUUID()
  seatId: string;
}

// DTO pour les repas par passager
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

// DTO pour un passager
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

// DTO pour les détails Mobile Money
export class MobileMoneyDetailsDto {
  @IsString()
  providerId: string;

  @IsString()
  phone: string;
}

// DTO pour un bagage
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

// DTO principal
export class CreateReservationDto {
  @IsUUID()
  tripId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PassengerDto)
  passengers: PassengerDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBaggageDto)
  baggageList?: CreateBaggageDto[];

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @IsOptional()
  @ValidateNested()
  @Type(() => MobileMoneyDetailsDto)
  mobileMoneyDetails?: MobileMoneyDetailsDto;

  // ✅ FPAY - directement dans le body
  @ValidateIf((o) => o.paymentMethod === PaymentMethod.FPAY)
  @IsString()
  pin?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @ValidateIf((o) => o.paymentMethod === PaymentMethod.FPAY)
  @IsString()
  phone?: string;

  @IsNumber()
  @Min(0)
  totalPrice: number;

  @ValidateIf((o) => o.paymentMethod === PaymentMethod.FPAY)
  @IsString()
  @IsNotEmpty({ message: 'Le token d\'accès FPay est requis pour le paiement FPAY' })
  access_token?: string;
}