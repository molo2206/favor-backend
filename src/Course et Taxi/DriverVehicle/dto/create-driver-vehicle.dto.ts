import { Transform } from 'class-transformer';
import {
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

export class CreateDriverVehicleDto {
  @IsUUID()
  categoryId: string;

  @IsString()
  model: string;

  @IsString()
  plateNumber: string;

  @IsString()
  color: string;

  @Transform(({ value }) => parseInt(value, 10)) // ← Convertir string en number
  @IsNumber()
  year: number;

  @IsOptional()
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
