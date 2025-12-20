import { Type } from 'class-transformer';
import { IsString, IsNumber, IsOptional, IsBoolean, IsUUID } from 'class-validator';

export class CreateTauxCompanyDto {
  @Type(() => Number)
  @IsNumber()
  value: number;
}
