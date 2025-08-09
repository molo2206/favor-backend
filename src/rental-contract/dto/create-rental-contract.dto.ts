import { IsUUID, IsDateString, IsNumber, IsEnum, IsOptional, IsString, IsNumberString } from 'class-validator';
import { RentalStatus } from '../enum/rentalStatus.enum';

export class CreateRentalContractDto {
  @IsUUID()
  @IsOptional() // optionnel, on peut le déduire avec @CurrentUser
  customerId?: string;

  @IsUUID()
  vehicleId: string;

  @IsDateString()
  startDate: string; // ← en string ISO, pas Date direct

  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsNumber()
  totalDays?: number; // Calculé automatiquement

  @IsOptional()
  @IsNumber()
  dailyRate?: number; // Calculé automatiquement

  @IsOptional()
  @IsNumber()
  totalAmount?: number; // Calculé automatiquement

  @IsOptional()
  @IsEnum(RentalStatus)
  status?: RentalStatus; // Défaut = PENDING

  @IsOptional()
  @IsNumberString() // accepte "23", "5", etc. mais pas "abc"
  quantity?: string;
}
