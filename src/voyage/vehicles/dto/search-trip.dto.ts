// dto/search-trip.dto.ts
import { IsOptional, IsString, IsInt, Min, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class SearchTripDto {
  @IsString()
  departureCity: string;

  @IsString()
  arrivalCity: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  passengers?: number;
}