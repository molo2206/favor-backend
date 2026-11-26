import { IsDateString, IsInt, Min, IsOptional, IsString } from 'class-validator';

export class SearchRoomsDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  adults?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  children?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  rooms?: number;

  @IsOptional()
  @IsString()
  destination?: string; // STRING pour LIKE, pas UUID
}
