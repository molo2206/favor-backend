import { IsBoolean, IsLatitude, IsLongitude, IsOptional } from 'class-validator';

export class UpdateDriverLocationDto {
  @IsLatitude()
  lat: number;

  @IsLongitude()
  lng: number;

  @IsOptional()
  @IsBoolean()
  isOnline?: boolean;

  @IsOptional()
  @IsBoolean()
  isBusy?: boolean;
}
