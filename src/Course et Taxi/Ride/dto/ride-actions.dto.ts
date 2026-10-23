import { Type } from 'class-transformer';
import {
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
