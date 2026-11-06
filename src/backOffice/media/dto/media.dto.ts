import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  MediaCrewRole,
  MediaFileType,
  MediaPaymentMethod,
  MediaPriority,
  MediaProjectKind,
  MediaProjectStatus,
  MediaServiceCategory,
  MediaSessionStatus,
  MediaSessionType,
  MediaUnit,
} from '../media.enums';

const toBool = ({ value }: { value: any }) =>
  value === undefined || value === null || value === '' ? undefined : value === true || value === 'true' || value === '1';

// ============================================================
// CATALOGUE DES PRESTATIONS
// ============================================================
export class CreateMediaServiceDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsString() @MinLength(2) @MaxLength(150) name: string;
  @IsOptional() @IsString() @MaxLength(20) code?: string;
  @IsOptional() @IsEnum(MediaServiceCategory) category?: MediaServiceCategory;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsEnum(MediaUnit) unit?: MediaUnit;
  @Type(() => Number) @IsNumber() @Min(0) unitPrice: number;
  @IsOptional() @IsString() @MaxLength(10) currency?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) durationMinutes?: number;
  @IsOptional() @IsString() @MaxLength(500) deliverables?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) deliveryDays?: number;
  @IsOptional() @IsString() @MaxLength(500) imageUrl?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateMediaServiceDto extends PartialType(CreateMediaServiceDto) { }

export class MediaServiceQueryDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsEnum(MediaServiceCategory) category?: MediaServiceCategory;
  @IsOptional() @IsString() includeInactive?: string;
  @IsOptional() @IsString() search?: string;
}

// ============================================================
// PROJETS
// ============================================================
export class MediaItemInputDto {
  /** Prestation du catalogue (prix et unité repris si absents) */
  @IsOptional() @IsUUID() serviceId?: string;
  @IsOptional() @IsString() @MaxLength(200) label?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.01) quantity?: number;
  @IsOptional() @IsEnum(MediaUnit) unit?: MediaUnit;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) unitPrice?: number;
}

export class CreateMediaProjectDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsEnum(MediaProjectKind) kind?: MediaProjectKind;
  @IsString() @MinLength(3) @MaxLength(200) title: string;
  @IsOptional() @IsString() @MaxLength(10000) description?: string;

  // Client externe
  @IsOptional() @IsUUID() clientUserId?: string;
  @IsOptional() @IsString() @MaxLength(150) clientName?: string;
  @IsOptional() @IsString() @MaxLength(50) clientPhone?: string;
  @IsOptional() @IsEmail() clientEmail?: string;
  // Demande interne
  @IsOptional() @IsUUID() clientCompanyId?: string;
  @IsOptional() @IsString() @MaxLength(120) requestingDepartment?: string;

  @IsOptional() @IsString() @MaxLength(100) eventType?: string;
  @IsOptional() @IsDateString() eventDate?: string;
  @IsOptional() @IsString() @MaxLength(255) location?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsEnum(MediaPriority) priority?: MediaPriority;
  @IsOptional() @IsUUID() managerId?: string;
  @IsOptional() @IsString() @MaxLength(10) currency?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) discount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) taxRate?: number;
  @IsOptional() @IsString() @MaxLength(10000) notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MediaItemInputDto)
  items?: MediaItemInputDto[];
}

export class UpdateMediaProjectDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(10000) description?: string;
  @IsOptional() @IsUUID() clientUserId?: string;
  @IsOptional() @IsString() @MaxLength(150) clientName?: string;
  @IsOptional() @IsString() @MaxLength(50) clientPhone?: string;
  @IsOptional() @IsEmail() clientEmail?: string;
  @IsOptional() @IsUUID() clientCompanyId?: string;
  @IsOptional() @IsString() @MaxLength(120) requestingDepartment?: string;
  @IsOptional() @IsString() @MaxLength(100) eventType?: string;
  @IsOptional() @IsDateString() eventDate?: string;
  @IsOptional() @IsString() @MaxLength(255) location?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsEnum(MediaPriority) priority?: MediaPriority;
  @IsOptional() @IsUUID() managerId?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) discount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) taxRate?: number;
  @IsOptional() @IsString() @MaxLength(10000) notes?: string;
}

export class SetProjectItemsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MediaItemInputDto)
  items: MediaItemInputDto[];
}

export class ChangeProjectStatusDto {
  @IsEnum(MediaProjectStatus) status: MediaProjectStatus;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class AddMediaPaymentDto {
  @Type(() => Number) @IsNumber() @Min(0.01) amount: number;
  @IsOptional() @IsEnum(MediaPaymentMethod) method?: MediaPaymentMethod;
  @IsOptional() @IsString() @MaxLength(100) reference?: string;
  @IsOptional() @IsDateString() paidAt?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class ShareProjectDto {
  /** Validité du lien de livraison (jours, défaut 30) */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) days?: number;
}

export class ProjectNoteDto {
  @IsString() @MinLength(2) @MaxLength(500) note: string;
}

export class MediaProjectQueryDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsEnum(MediaProjectKind) kind?: MediaProjectKind;
  @IsOptional() @IsEnum(MediaProjectStatus) status?: MediaProjectStatus;
  @IsOptional() @IsString() paymentStatus?: string;
  @IsOptional() @IsUUID() managerId?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  /** Référence, titre, client */
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
}

// ============================================================
// PLANNING (séances)
// ============================================================
export class CreateMediaSessionDto {
  @IsString() @MinLength(2) @MaxLength(200) title: string;
  @IsOptional() @IsEnum(MediaSessionType) type?: MediaSessionType;
  @IsDateString() startAt: string;
  @IsDateString() endAt: string;
  @IsOptional() @IsString() @MaxLength(255) location?: string;
  @IsOptional() @Type(() => Number) @IsLatitude() latitude?: number;
  @IsOptional() @Type(() => Number) @IsLongitude() longitude?: number;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
  /** Affecter l'équipe et réserver le matériel dès la création */
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AssignCrewDto) crew?: AssignCrewDto[];
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) assetIds?: string[];
}

export class UpdateMediaSessionDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) title?: string;
  @IsOptional() @IsEnum(MediaSessionType) type?: MediaSessionType;
  @IsOptional() @IsDateString() startAt?: string;
  @IsOptional() @IsDateString() endAt?: string;
  @IsOptional() @IsString() @MaxLength(255) location?: string;
  @IsOptional() @Type(() => Number) @IsLatitude() latitude?: number;
  @IsOptional() @Type(() => Number) @IsLongitude() longitude?: number;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
}

export class SessionStatusDto {
  @IsEnum(MediaSessionStatus) status: MediaSessionStatus;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class AssignCrewDto {
  @IsUUID() userId: string;
  @IsOptional() @IsEnum(MediaCrewRole) role?: MediaCrewRole;
  @IsOptional() @IsString() @MaxLength(255) note?: string;
}

export class BookEquipmentDto {
  @IsUUID() assetId: string;
  @IsOptional() @IsString() @MaxLength(255) note?: string;
}

export class SessionQueryDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @IsUUID() assetId?: string;
  @IsOptional() @IsEnum(MediaSessionStatus) status?: MediaSessionStatus;
  /** Période du calendrier (défaut : les 30 prochains jours) */
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
}

export class AvailabilityQueryDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsDateString() startAt: string;
  @IsDateString() endAt: string;
  /** Exclure une séance (modification d'une séance existante) */
  @IsOptional() @IsUUID() excludeSessionId?: string;
  /** Lister le matériel d'une catégorie de biens (ex. « Caméras », « Drones ») */
  @IsOptional() @IsUUID() assetCategoryId?: string;
  /** ✅ Équipe = employés RH : filtrer sur un département (ex. « Média ») */
  @IsOptional() @IsUUID() departmentId?: string;
}

// ============================================================
// MÉDIATHÈQUE
// ============================================================
export class CreateMediaFileDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() sessionId?: string;
  /** Lien externe (Drive, WeTransfer, YouTube…) si aucun fichier n'est envoyé */
  @IsOptional() @IsUrl({ require_tld: false }) url?: string;
  @IsOptional() @IsEnum(MediaFileType) type?: MediaFileType;
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @Transform(toBool) @IsBoolean() isDeliverable?: boolean;
  @IsOptional() @Transform(toBool) @IsBoolean() isPortfolio?: boolean;
  /** "mariage,drone" ou ["mariage","drone"] */
  @IsOptional() tags?: string[] | string;
}

export class UpdateMediaFileDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @Transform(toBool) @IsBoolean() isDeliverable?: boolean;
  @IsOptional() @Transform(toBool) @IsBoolean() isPortfolio?: boolean;
  @IsOptional() tags?: string[] | string;
  @IsOptional() @IsUUID() projectId?: string;
}

export class MediaFileQueryDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsEnum(MediaFileType) type?: MediaFileType;
  @IsOptional() @IsString() isDeliverable?: string;
  @IsOptional() @IsString() isPortfolio?: string;
  @IsOptional() @IsString() tag?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
}
