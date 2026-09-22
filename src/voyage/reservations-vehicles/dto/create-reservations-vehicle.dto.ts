import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { ReservationStatus } from '../enum/reservation-status.enum';
import { ReservationType } from '../entities/reservations-vehicle.entity';

export class CreateReservationDto {
  // ============================================================
  // ✅ TYPE (TRIP ou VEHICLE)
  // ============================================================
  @IsOptional()
  @IsEnum(ReservationType)
  type?: ReservationType;

  // ============================================================
  // 👤 CLIENT
  // ============================================================
  @IsOptional()
  @IsString()
  userId?: string;

  // ============================================================
  // 🚌 TRIP (voyage — existant)
  // ============================================================
  @IsOptional()
  @IsString()
  tripId?: string;

  // ============================================================
  // 🚗 PRODUCT (voiture — nouveau)
  // ============================================================
  @IsOptional()
  @IsString()
  productId?: string;

  // ============================================================
  // 📅 DATES (voiture)
  // ============================================================
  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  // ============================================================
  // 💰 PRIX ET STATUT
  // ============================================================
  @IsOptional()
  @IsEnum(ReservationStatus)
  status?: ReservationStatus;

  @IsOptional()
  @IsNumber()
  totalAmount?: number;
}