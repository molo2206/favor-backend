import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

/** multipart/form-data : "true"/"false" → booléen */
const toBool = ({ value }: { value: any }) => (value === 'true' || value === '1' ? true : value === 'false' || value === '0' ? false : value);
/** multipart/form-data : "12" → 12 ; "" → absent */
const toNum = ({ value }: { value: any }) => (value === '' || value === null || value === undefined ? undefined : Number(value));
/** multipart/form-data : tableau envoyé en JSON ou en "a,b" */
const toArray = ({ value }: { value: any }) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* pas du JSON */
    }
    return value.split(',').map((v) => v.trim()).filter(Boolean);
  }
  return value;
};

export const KYC_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type KycStatus = (typeof KYC_STATUSES)[number];

/** ✅ Admin : liste des véhicules des chauffeurs */
export class AdminDriverVehicleQueryDto {
  @IsOptional() @IsIn(KYC_STATUSES as unknown as string[]) kycStatus?: KycStatus;
  @IsOptional() @IsUUID() driverId?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  /** ✅ Chauffeurs privés ou membres d'une association */
  @IsOptional() @IsIn(['PRIVATE', 'ASSOCIATION']) driverType?: 'PRIVATE' | 'ASSOCIATION';
  @IsOptional() @IsUUID() associationId?: string;
  /** Modèle, plaque, couleur, nom / téléphone du chauffeur */
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  /** true (défaut) : actifs ; false : supprimés ; all : tous */
  @IsOptional() @IsIn(['true', 'false', 'all']) active?: 'true' | 'false' | 'all';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

/** ✅ Admin : modifier n'importe quel véhicule (multipart possible avec les documents) */
export class AdminUpdateDriverVehicleDto {
  /** Rattacher le véhicule à un autre chauffeur */
  @IsOptional() @IsUUID() driverId?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(255) model?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(255) plateNumber?: string;
  @IsOptional() @IsString() @MaxLength(255) color?: string;
  @IsOptional() @Transform(toNum) @IsInt() @Min(1950) @Max(2100) year?: number;
  @IsOptional() @Transform(toBool) @IsBoolean() isDefault?: boolean;
  @IsOptional() @Transform(toBool) @IsBoolean() isActive?: boolean;

  /** Commission de la plateforme (%) ; vide = inchangée */
  @IsOptional() @Transform(toNum) @IsNumber() @Min(0) @Max(100) commissionRate?: number;

  /** Statut des documents fixé directement par l'admin */
  @IsOptional() @IsIn(KYC_STATUSES as unknown as string[]) kycStatus?: KycStatus;
  @IsOptional() @IsString() @MaxLength(500) kycRejectionReason?: string;

  /** Photos : remplacer toutes les photos par les nouvelles envoyées (sinon elles s'ajoutent) */
  @IsOptional() @Transform(toBool) @IsBoolean() replacePhotos?: boolean;
  /** Photos à retirer (URLs) */
  @IsOptional() @Transform(toArray) @IsArray() @IsUrl({ require_tld: false }, { each: true }) removePhotos?: string[];
  /** Documents à retirer : registration, assurance, permi */
  @IsOptional() @Transform(toArray) @IsArray() @IsIn(['registration', 'assurance', 'permi'], { each: true }) removeDocuments?: string[];
}

/** ✅ Admin : valider ou refuser les documents du véhicule */
export class ReviewVehicleKycDto {
  @IsIn(['APPROVED', 'REJECTED'])
  status: 'APPROVED' | 'REJECTED';

  /** Obligatoire en cas de refus : affiché au chauffeur */
  @ValidateIf((o) => o.status === 'REJECTED')
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason?: string;
}
