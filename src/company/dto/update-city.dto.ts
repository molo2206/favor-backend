// update-city.dto.ts
import { IsOptional, IsString, IsUUID, IsBoolean, IsObject } from 'class-validator';

export class UpdateCityDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsUUID()
  countryId?: string;

  @IsOptional()
  @IsBoolean()
  status?: boolean;

  @IsOptional()
  @IsObject()
  tarif?: any;

  @IsOptional()
  @IsBoolean()
  clearTarif?: boolean;
}