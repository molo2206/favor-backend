import { PartialType } from '@nestjs/mapped-types';
import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MediaContentType, MediaPublicationStatus } from '../media.enums';

/** multipart/form-data : liste en JSON ou séparée par des virgules */
const toList = ({ value }: { value: any }) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value;
  const v = String(value).trim();
  if (v.startsWith('[')) {
    try {
      return JSON.parse(v);
    } catch {
      return value;
    }
  }
  return v.split(',').map((x) => x.trim()).filter(Boolean);
};

const toJsonArrayOf = (cls: new () => any) => ({ value }: { value: any }) => {
  let v = value;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return value;
    }
  }
  return Array.isArray(v) ? plainToInstance(cls, v) : v;
};

export class CreatePublicationDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsUUID() projectId?: string;
  @IsString() @MinLength(2) @MaxLength(200) title: string;
  @IsOptional() @IsString() @MaxLength(10000) description?: string;
  @IsOptional() @IsEnum(MediaContentType) type?: MediaContentType;
  /** Où c'est diffusé (texte libre) : ["Facebook", "Écran accueil"] */
  @IsOptional() @Transform(toList) @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(60, { each: true }) channels?: string[];
  /** Fichiers de la médiathèque */
  @IsOptional() @Transform(toList) @IsArray() @ArrayMaxSize(30) @IsUUID('all', { each: true }) mediaFileIds?: string[];
  /** Diffusée tout de suite (sinon brouillon) */
  @IsOptional() @IsEnum(MediaPublicationStatus) status?: MediaPublicationStatus;
  @IsOptional() @IsDateString() publishedAt?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsString() @MaxLength(500) coverUrl?: string;
}

export class UpdatePublicationDto extends PartialType(CreatePublicationDto) { }

export class PublicationQueryDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsEnum(MediaPublicationStatus) status?: MediaPublicationStatus;
  @IsOptional() @IsEnum(MediaContentType) type?: MediaContentType;
  @IsOptional() @IsString() @MaxLength(60) channel?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

/** Relevé saisi par l'admin : les compteurs ACTUELS (totaux affichés) à la date indiquée */
export class RecordPublicationStatsDto {
  /** Date du relevé (défaut : aujourd'hui) */
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) views?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) likes?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) comments?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) shares?: number;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class BulkStatsLineDto extends RecordPublicationStatsDto {
  @IsUUID() publicationId: string;
}

/** Saisie de plusieurs publications en une fois */
export class BulkPublicationStatsDto {
  @IsOptional() @IsDateString() date?: string;
  @Transform(toJsonArrayOf(BulkStatsLineDto)) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true })
  lines: BulkStatsLineDto[];
}

export class PublicationReportQueryDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsString() @MaxLength(60) channel?: string;
  @IsOptional() @IsEnum(MediaContentType) type?: MediaContentType;
  /** Défaut : 30 derniers jours */
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) top?: number;
}
