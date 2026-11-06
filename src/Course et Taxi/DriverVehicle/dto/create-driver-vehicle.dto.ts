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
  ValidateIf,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { toIdArray } from '../vehicle-categories.util';

export class CreateDriverVehicleDto {
  /** Catégorie principale (facultative si categoryIds est envoyé) */
  @ValidateIf((o) => !o.categoryIds?.length || o.categoryId !== undefined)
  @IsUUID()
  categoryId: string;

  /**
   * ✅ Toutes les catégories où le véhicule peut faire des courses (ex. Confort + Familiale).
   *    JSON ["id1","id2"] ou multipart "id1,id2". La catégorie principale (categoryId) est ajoutée d'office.
   *    Sans categoryId : la première de la liste devient la catégorie principale.
   */
  @IsOptional()
  @Transform(toIdArray)
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  categoryIds?: string[];

  @IsString()
  model: string;

  @IsString()
  plateNumber: string;

  @IsString()
  color: string;

  @Transform(({ value }) => parseInt(value, 10)) // ← Convertir string en number
  @IsNumber()
  year: number;

  /** ✅ Nombre de places passagers (chauffeur non compris), ex. 4 ou 6 */
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null || value === undefined ? undefined : parseInt(value, 10)))
  @IsInt()
  @Min(1)
  @Max(60)
  seats?: number;

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
