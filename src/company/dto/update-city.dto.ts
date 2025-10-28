import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateCityDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsNotEmpty()
  @IsUUID()
  countryId?: string;
}
