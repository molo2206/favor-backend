import { Transform } from 'class-transformer';
import {
  Max,
  Min,
  IsUUID,
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsUrl,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  IsEnum,
} from 'class-validator';

export class CreateDriverVehicleByAdminDto {
  @IsUUID()
  driverId: string;

  @IsUUID()
  categoryId: string;

  @IsString()
  model: string;

  @IsString()
  plateNumber: string;

  @IsString()
  color: string;

  @Transform(({ value }) => (value === '' || value === null || value === undefined ? value : Number(value)))
  @IsNumber()
  year: number;

  /** ✅ Commission de la plateforme sur les courses de ce véhicule (15 = 15 %) */
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null || value === undefined ? undefined : Number(value)))
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionRate?: number;

  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  isDefault?: boolean;

  //KYC FIELDS - Tous optionnels
  @IsOptional()
  @IsUrl({}, { message: 'URL de document invalide' })
  registrationUrl?: string;

  @IsOptional()
  @IsUrl({}, { message: 'URL de document invalide' })
  assuranceUrl?: string;

  @IsOptional()
  @IsUrl({}, { message: 'URL de document invalide' })
  permi?: string;

  @IsOptional()
  @IsEnum(['PENDING', 'APPROVED', 'REJECTED'])
  kycStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsArray({ message: 'Les photos doivent être un tableau' })
  @ArrayMinSize(1, { message: 'Au moins une photo est requise' })
  @ArrayMaxSize(10, { message: 'Maximum 10 photos autorisées' })
  @IsUrl(
    {},
    {
      each: true, // Valide chaque élément du tableau
      message: 'Chaque photo doit avoir une URL valide',
    },
  )
  photos?: string[]; // Tableau d'URLs de photos
}
