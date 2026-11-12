import { Transform } from 'class-transformer';
import { IsNumber, IsOptional, Max, Min, ValidateIf } from 'class-validator';

/** ✅ Admin : commission de la plateforme pour un véhicule (null = valeur par défaut) */
export class UpdateVehicleCommissionDto {
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === undefined ? undefined : value === null || value === 'null' ? null : Number(value)))
  @ValidateIf((_, v) => v !== null)
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionRate: number | null;
}
