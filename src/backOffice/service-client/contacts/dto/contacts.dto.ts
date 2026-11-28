import { ArrayNotEmpty, IsArray, IsBoolean, IsEnum, IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';
import { ContactRefType } from '../enums/contact-ref-type.enum';
import { ObjectivePeriodicity } from '../enums/objective-periodicity.enum';

/** Créer / modifier un objectif de contact */
export class UpsertObjectiveDto {
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;
  /** Filtres by-destination (type, city, country, shippingCompanyId, onlySellers…) */
  @IsOptional() @IsObject() filters?: Record<string, any>;
  @IsOptional() @IsEnum(ObjectivePeriodicity) periodicity?: ObjectivePeriodicity;
  @IsOptional() @IsInt() @Min(0) targetCount?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

/** Marquer un client « contacté » (+ note facultative) */
export class MarkContactedDto {
  @IsString() clientUserId: string;
  @IsOptional() @IsEnum(ContactRefType) refType?: ContactRefType;
  @IsOptional() @IsString() refId?: string;
  /** Rattacher le contact à un objectif (période courante calculée automatiquement) */
  @IsOptional() @IsString() objectiveId?: string;
  @IsOptional() @IsString() note?: string;
  /** false pour décocher (par défaut true) */
  @IsOptional() @IsBoolean() contacted?: boolean;
}

/** État « contacté » pour une liste de clients (à fusionner avec by-destination) */
export class ContactStatusDto {
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) clientUserIds: string[];
  /** Si fourni → état pour la période EN COURS de cet objectif */
  @IsOptional() @IsString() objectiveId?: string;
  @IsOptional() @IsEnum(ContactRefType) refType?: ContactRefType;
  @IsOptional() @IsString() refId?: string;
}
