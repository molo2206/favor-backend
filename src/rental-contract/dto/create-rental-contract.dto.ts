import { IsUUID, IsDateString, IsNumber, IsEnum, IsOptional } from 'class-validator';
import { RentalStatus } from '../enum/rentalStatus.enum';

export class CreateRentalContractDto {
  @IsUUID()
  @IsOptional()
  customerId?: string;

  @IsUUID()
  vehicleId: string;

  @IsDateString()
  startDate: Date;

  @IsDateString()
  endDate: Date;

  @IsNumber()
  totalDays: number;

  @IsNumber()
  dailyRate: number;

  @IsNumber()
  totalAmount: number;

  @IsEnum(RentalStatus)
  status: RentalStatus;
}
