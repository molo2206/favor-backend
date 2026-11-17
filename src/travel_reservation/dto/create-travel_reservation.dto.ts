import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsBoolean,
} from 'class-validator';
import { TravelType } from 'src/travel_reservation/enum/travel.type.enum';

export class CreateTravelReservationDto {
  @IsEnum(TravelType)
  type: TravelType;

  @IsOptional()
  @IsString()
  departureLocation?: string;

  @IsOptional()
  @IsString()
  arrivalLocation?: string;

  @IsOptional()
  @IsDateString()
  departureDate?: Date;

  @IsOptional()
  @IsDateString()
  arrivalDate?: Date;

//   @IsOptional()
//   @IsNumber()
//   price?: number;

  @IsOptional()
  @IsString()
  seatNumber?: string;
}
