import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  MediaCrewRole,
  MediaPaymentMethod,
  MediaServiceCategory,
  MediaUnit,
  MediaVendorAssignmentStatus,
  MediaVendorDocumentType,
  MediaVendorDomain,
  MediaVendorStatus,
  MediaVendorType,
} from '../media.enums';

const toBool = ({ value }: { value: any }) =>
  value === undefined || value === null || value === '' ? undefined : value === true || value === 'true' || value === '1';

/** Accepte un tableau JSON, une liste « a,b » ou un tableau (multipart / JSON) */
const toList = ({ value }: { value: any }) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value;
  const raw = String(value).trim();
  if (raw.startsWith('[')) {
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
};

/** Accepte un tableau JSON (multipart) ou un tableau d'objets */
const toObjects = ({ value }: { value: any }) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return value;
  }
};

// ============================================================
// ✅ PRESTATIONS ET TARIFS
// ============================================================
export class CreateVendorRateDto {
  /** Nom de la prestation (ex. « Couverture photo mariage ») */
  @IsString() @MinLength(2) @MaxLength(150) name: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsEnum(MediaVendorDomain) domain?: MediaVendorDomain;
  @IsOptional() @IsEnum(MediaServiceCategory) category?: MediaServiceCategory;
  /** HOUR, DAY, SESSION, PROJECT (défaut), ITEM, MONTH */
  @IsOptional() @IsEnum(MediaUnit) unit?: MediaUnit;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(999999999999) price: number;
  /** USD (défaut), CDF, EUR… */
  @IsOptional() @IsString() @MinLength(3) @MaxLength(10) currency?: string;
  @IsOptional() @IsString() @MaxLength(1000) conditions?: string;
  @IsOptional() @Transform(toBool) @IsBoolean() isActive?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(9999) sortOrder?: number;
}
export class UpdateVendorRateDto extends PartialType(CreateVendorRateDto) { }

export class VendorRateStatusDto {
  @Transform(toBool) @IsBoolean() isActive: boolean;
}

/** Catalogue des tarifs de tous les prestataires (comparaison) */
export class VendorRatesQueryDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsUUID() vendorId?: string;
  /** Un ou plusieurs domaines : PHOTOGRAPHER,VIDEOGRAPHER */
  @IsOptional() @IsString() domain?: string;
  @IsOptional() @IsEnum(MediaServiceCategory) category?: MediaServiceCategory;
  @IsOptional() @IsEnum(MediaUnit) unit?: MediaUnit;
  @IsOptional() @IsString() @MaxLength(10) currency?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minPrice?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) maxPrice?: number;
  /** true (défaut) : seulement les prestations actives de prestataires actifs ; false : tout */
  @IsOptional() @IsString() activeOnly?: string;
  /** Prestation, description, prestataire, code */
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsIn(['price', 'name', 'vendor', 'createdAt']) sortBy?: string;
  @IsOptional() @IsIn(['ASC', 'DESC', 'asc', 'desc']) sortOrder?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
}

export class VendorRatesExportQueryDto extends VendorRatesQueryDto {
  @IsOptional() @IsIn(['xlsx', 'pdf']) format?: 'xlsx' | 'pdf';
}

/** Activer / désactiver simplement un prestataire */
export class ToggleVendorDto {
  @Transform(toBool) @IsBoolean() active: boolean;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

// ============================================================
// RÉFÉRENTIEL DES PRESTATAIRES
// ============================================================
export class CreateMediaVendorDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsEnum(MediaVendorType) type?: MediaVendorType;
  @IsString() @MinLength(2) @MaxLength(150) name: string;
  @IsOptional() @IsString() @MaxLength(200) legalName?: string;
  @IsOptional() @IsString() @MaxLength(150) contactName?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(30) whatsapp?: string;
  @IsOptional() @IsEmail() @MaxLength(150) email?: string;
  @IsOptional() @IsString() @MaxLength(255) address?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(100) country?: string;
  /** Compte Favor Help du prestataire (notifications de mission) */
  @IsOptional() @IsUUID() userId?: string;

  /** Domaines d'intervention : PHOTOGRAPHER, VIDEOGRAPHER, INFOGRAPHIST, GRAPHIC_DESIGNER, COMMUNICATION_AGENCY, PRINTER… */
  @IsOptional() @Transform(toList) @IsArray() @ArrayMaxSize(10) @IsEnum(MediaVendorDomain, { each: true }) domains?: MediaVendorDomain[];
  /** Précision si « OTHER » */
  @IsOptional() @IsString() @MaxLength(150) domainOther?: string;
  @IsOptional() @Transform(toList) @IsArray() @ArrayMaxSize(10) @IsEnum(MediaServiceCategory, { each: true }) categories?: MediaServiceCategory[];
  @IsOptional() @Transform(toList) @IsArray() @ArrayMaxSize(10) @IsEnum(MediaCrewRole, { each: true }) roles?: MediaCrewRole[];
  @IsOptional() @IsString() @MaxLength(500) specialties?: string;
  @IsOptional() @IsString() @MaxLength(500) equipment?: string;
  @IsOptional() @IsString() @MaxLength(500) portfolioUrl?: string;
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  })
  @IsObject()
  socialLinks?: Record<string, string>;
  /** Supprimer la photo actuelle (modification) */
  @IsOptional() @Transform(toBool) @IsBoolean() removePhoto?: boolean;
  @IsOptional() @Transform(toList) @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) languages?: string[];

  @IsOptional() @IsEnum(MediaUnit) rateUnit?: MediaUnit;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) rateAmount?: number;
  @IsOptional() @IsString() @MaxLength(10) currency?: string;
  @IsOptional() @IsEnum(MediaPaymentMethod) paymentMethod?: MediaPaymentMethod;
  @IsOptional() @IsString() @MaxLength(30) mobileMoneyNumber?: string;
  @IsOptional() @IsString() @MaxLength(100) bankName?: string;
  @IsOptional() @IsString() @MaxLength(60) bankAccount?: string;
  @IsOptional() @IsString() @MaxLength(60) taxId?: string;

  @IsOptional() @Transform(toBool) @IsBoolean() ndaSigned?: boolean;
  @IsOptional() @IsDateString() contractStartDate?: string;
  @IsOptional() @IsDateString() contractEndDate?: string;
  /** PROSPECT (défaut ACTIVE) */
  @IsOptional() @IsIn([MediaVendorStatus.PROSPECT, MediaVendorStatus.ACTIVE]) status?: MediaVendorStatus;
  /** Observations internes */
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
  /** Conditions particulières (acompte, déplacement, délais, droits d'utilisation…) */
  @IsOptional() @IsString() @MaxLength(5000) conditions?: string;

  /** Prestations et tarifs saisis en même temps que la fiche (création uniquement) */
  @IsOptional() @Transform(toObjects) @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => CreateVendorRateDto)
  rates?: CreateVendorRateDto[];
}
export class UpdateMediaVendorDto extends PartialType(CreateMediaVendorDto) { }

export class ChangeVendorStatusDto {
  @IsEnum(MediaVendorStatus) status: MediaVendorStatus;
  /** Obligatoire pour SUSPENDED et BLACKLISTED */
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class MediaVendorQueryDto {
  @IsOptional() @IsUUID() companyId?: string;
  /** Un ou plusieurs statuts : ACTIVE,PROSPECT (par défaut : tous sauf ARCHIVED) */
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsEnum(MediaVendorType) type?: MediaVendorType;
  @IsOptional() @IsEnum(MediaServiceCategory) category?: MediaServiceCategory;
  /** Un ou plusieurs domaines : PHOTOGRAPHER,PRINTER */
  @IsOptional() @IsString() domain?: string;
  /** Prestataires ayant au moins une prestation dans cette devise */
  @IsOptional() @IsString() @MaxLength(10) currency?: string;
  /** true : joindre les prestations actives et leurs tarifs à chaque prestataire */
  @IsOptional() @IsString() withRates?: string;
  /** true : seulement ceux qui ont au moins une prestation active ; false : ceux qui n'en ont aucune */
  @IsOptional() @IsString() hasRates?: string;
  @IsOptional() @IsEnum(MediaCrewRole) role?: MediaCrewRole;
  @IsOptional() @IsString() city?: string;
  /** Note minimale (0 à 5) */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(5) minRating?: number;
  /** true : seulement ceux qui ont un solde à payer */
  @IsOptional() @IsString() withBalance?: string;
  /** Nom, code, téléphone, e-mail, spécialités, prestations */
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsIn(['name', 'rating', 'createdAt', 'code']) sortBy?: string;
  @IsOptional() @IsIn(['ASC', 'DESC', 'asc', 'desc']) sortOrder?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
}

export class VendorAvailabilityQueryDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsDateString() startAt: string;
  @IsDateString() endAt: string;
  @IsOptional() @IsEnum(MediaServiceCategory) category?: MediaServiceCategory;
  @IsOptional() @IsEnum(MediaCrewRole) role?: MediaCrewRole;
}

// ============================================================
// DOSSIER (pièces)
// ============================================================
/** multipart/form-data : fichier (champ « file ») ou url */
export class CreateVendorDocumentDto {
  @IsOptional() @IsEnum(MediaVendorDocumentType) type?: MediaVendorDocumentType;
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(1000) url?: string;
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

// ============================================================
// MISSIONS
// ============================================================
export class CreateVendorAssignmentDto {
  @IsUUID() vendorId: string;
  /** Prestation du prestataire : reprend son tarif, son unité et sa devise */
  @IsOptional() @IsUUID() rateId?: string;
  /** Séance du projet (période reprise de la séance) */
  @IsOptional() @IsUUID() sessionId?: string;
  @IsOptional() @IsEnum(MediaCrewRole) role?: MediaCrewRole;
  @IsOptional() @IsEnum(MediaServiceCategory) category?: MediaServiceCategory;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsDateString() startAt?: string;
  @IsOptional() @IsDateString() endAt?: string;
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.01) quantity?: number;
  @IsOptional() @IsEnum(MediaUnit) unit?: MediaUnit;
  /** Coût unitaire (défaut : tarif du prestataire) */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) unitCost?: number;
  @IsOptional() @IsString() @MaxLength(10) currency?: string;
  /** true : confirmée directement (le prestataire a déjà accepté) */
  @IsOptional() @Transform(toBool) @IsBoolean() confirmed?: boolean;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class UpdateVendorAssignmentDto {
  @IsOptional() @IsEnum(MediaCrewRole) role?: MediaCrewRole;
  @IsOptional() @IsEnum(MediaServiceCategory) category?: MediaServiceCategory;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsDateString() startAt?: string;
  @IsOptional() @IsDateString() endAt?: string;
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.01) quantity?: number;
  @IsOptional() @IsEnum(MediaUnit) unit?: MediaUnit;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) unitCost?: number;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class VendorAssignmentStatusDto {
  @IsEnum(MediaVendorAssignmentStatus) status: MediaVendorAssignmentStatus;
  /** Motif (annulation) ou commentaire */
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  /** Lien du travail rendu (DELIVERED) */
  @IsOptional() @IsString() @MaxLength(1000) deliveryUrl?: string;
  /** Évaluation à la validation (VALIDATED) */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) rating?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) quality?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) punctuality?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) communication?: number;
  @IsOptional() @IsString() @MaxLength(1000) review?: string;
}

export class VendorAssignmentQueryDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsUUID() vendorId?: string;
  @IsOptional() @IsUUID() projectId?: string;
  /** Un ou plusieurs statuts séparés par des virgules */
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() paymentStatus?: string;
  /** true : missions en retard (date limite dépassée, pas encore rendues) */
  @IsOptional() @IsString() late?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
}

// ============================================================
// PAIEMENTS
// ============================================================
export class AddVendorPaymentDto {
  @Type(() => Number) @IsNumber() @Min(0.01) amount: number;
  @IsOptional() @IsEnum(MediaPaymentMethod) method?: MediaPaymentMethod;
  @IsOptional() @IsString() @MaxLength(100) reference?: string;
  @IsOptional() @IsString() @MaxLength(1000) receiptUrl?: string;
  @IsOptional() @IsDateString() paidAt?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class VendorStatementQueryDto {
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  /** json (défaut), xlsx ou pdf */
  @IsOptional() @IsIn(['json', 'xlsx', 'pdf']) format?: string;
}
