import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { SocialPlatform, SocialPostStatus, SocialPostType, SocialStatsMode, SocialTargetStatus } from '../media.enums';

const toBool = ({ value }: { value: any }) =>
  value === undefined || value === null || value === '' ? undefined : value === true || value === 'true' || value === '1';

const toList = ({ value }: { value: any }) =>
  value === undefined || value === null || value === ''
    ? undefined
    : Array.isArray(value)
      ? value
      : String(value).split(',').map((v) => v.trim()).filter(Boolean);

// ============================================================
// COMPTES / PAGES
// ============================================================
export class CreateSocialAccountDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsEnum(SocialPlatform) platform: SocialPlatform;
  @IsString() @MinLength(1) @MaxLength(150) name: string;
  @IsOptional() @IsString() @MaxLength(150) handle?: string;
  @IsOptional() @IsString() @MaxLength(500) url?: string;
  /** Projet média (gestion des réseaux d'un client) */
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsString() @MaxLength(150) clientName?: string;
  /** Community manager */
  @IsOptional() @IsUUID() managerId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) followers?: number;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class UpdateSocialAccountDto extends PartialType(CreateSocialAccountDto) {
  @IsOptional() @Transform(toBool) @IsBoolean() isActive?: boolean;
}

export class SocialAccountQueryDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsEnum(SocialPlatform) platform?: SocialPlatform;
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() managerId?: string;
  @IsOptional() @Transform(toBool) @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() search?: string;
}

// ============================================================
// PUBLICATIONS
// ============================================================
export class CreateSocialPostDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsUUID() projectId?: string;
  @IsString() @MinLength(2) @MaxLength(200) title: string;
  @IsOptional() @IsString() @MaxLength(10000) caption?: string;
  @IsOptional() @Transform(toList) @IsArray() @ArrayMaxSize(60) @IsString({ each: true }) hashtags?: string[];
  @IsOptional() @IsEnum(SocialPostType) type?: SocialPostType;
  /** Fichiers de la médiathèque (bo_media_files) */
  @IsOptional() @Transform(toList) @IsArray() @ArrayMaxSize(30) @IsUUID('all', { each: true }) mediaFileIds?: string[];
  @IsOptional() @IsString() @MaxLength(1000) link?: string;
  @IsOptional() @IsString() @MaxLength(120) campaign?: string;
  /** Comptes / plateformes sur lesquels publier */
  @IsOptional() @Transform(toList) @IsArray() @ArrayMaxSize(30) @IsUUID('all', { each: true }) accountIds?: string[];
  @IsOptional() @IsDateString() scheduledAt?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class UpdateSocialPostDto extends PartialType(CreateSocialPostDto) { }

export class SocialPostStatusDto {
  @IsEnum(SocialPostStatus) status: SocialPostStatus;
  @IsOptional() @IsDateString() scheduledAt?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class SocialPostQueryDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() accountId?: string;
  @IsOptional() @IsEnum(SocialPlatform) platform?: SocialPlatform;
  @IsOptional() @IsEnum(SocialPostStatus) status?: SocialPostStatus;
  @IsOptional() @IsEnum(SocialPostType) type?: SocialPostType;
  @IsOptional() @IsString() campaign?: string;
  @IsOptional() @IsString() search?: string;
  /** Période (date de publication, sinon date programmée, sinon création) */
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

/** Calendrier éditorial */
export class SocialCalendarQueryDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsEnum(SocialPlatform) platform?: SocialPlatform;
  @IsDateString() from: string;
  @IsDateString() to: string;
}

// ============================================================
// PLATEFORMES D'UNE PUBLICATION
// ============================================================
export class AddPostTargetsDto {
  @Transform(toList) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(30) @IsUUID('all', { each: true }) accountIds: string[];
}

/** Marquer publié sur une plateforme (lien du post) */
export class PublishTargetDto {
  @IsOptional() @IsDateString() publishedAt?: string;
  @IsOptional() @IsString() @MaxLength(1000) postUrl?: string;
  @IsOptional() @IsString() @MaxLength(255) externalId?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class UpdateTargetDto {
  @IsOptional() @IsEnum(SocialTargetStatus) status?: SocialTargetStatus;
  @IsOptional() @IsDateString() publishedAt?: string;
  @IsOptional() @IsString() @MaxLength(1000) postUrl?: string;
  @IsOptional() @IsString() @MaxLength(255) externalId?: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) boostSpent?: number;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

// ============================================================
// STATISTIQUES
// ============================================================
export class PostStatsValuesDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) likes?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) comments?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) shares?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) saves?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) views?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) reach?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) impressions?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) clicks?: number;
}

/**
 * Relevé d'une journée pour une publication sur une plateforme.
 * mode DAILY : chiffres gagnés CE jour ; mode TOTAL : compteurs affichés par le réseau
 * (le gain du jour = total − somme des jours précédents).
 */
export class RecordPostStatsDto extends PostStatsValuesDto {
  /** Date du relevé (YYYY-MM-DD), défaut aujourd'hui */
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsEnum(SocialStatsMode) mode?: SocialStatsMode;
}

export class BulkPostStatsLineDto extends RecordPostStatsDto {
  @IsUUID() targetId: string;
}

export class BulkPostStatsDto {
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsEnum(SocialStatsMode) mode?: SocialStatsMode;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => BulkPostStatsLineDto)
  lines: BulkPostStatsLineDto[];
}

export class RecordAccountStatsDto {
  @IsOptional() @IsDateString() date?: string;
  /** Abonnés en fin de journée */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) followers?: number;
  /** Nouveaux abonnés (calculé depuis la veille si absent) */
  @IsOptional() @Type(() => Number) @IsInt() newFollowers?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) reach?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) impressions?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) profileViews?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) messages?: number;
}

export class SocialReportQueryDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() accountId?: string;
  @IsOptional() @IsEnum(SocialPlatform) platform?: SocialPlatform;
  @IsOptional() @IsString() campaign?: string;
  /** Défaut : 30 derniers jours */
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) top?: number;
}

export class SocialStatsQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}
