import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateCityDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsUUID()
  countryId?: string;
}