import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** Un palier : [minValue … maxValue] → price */
export class PickupTierDto {
  @Type(() => Number) @IsInt() @Min(0) minValue: number;
  /** NULL / absent = palier ouvert « et au-delà » */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxValue?: number | null;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) price: number;
}

export class CreatePickupTariffDto {
  @IsOptional() @IsString() @MaxLength(150) name?: string;

  /** Relation pays (countries.id) */
  @IsUUID() countryId: string;

  /** Relation ville (cities.id) — NULL / absent = tarif par défaut du pays */
  @IsOptional() @IsUUID() cityId?: string | null;

  @IsOptional() @IsString() @MaxLength(10) currency?: string;

  @IsOptional() @IsBoolean() isActive?: boolean;

  /** Paliers (au moins un). Ex. [{min:1,max:10,price:2},{min:11,max:20,price:3}] */
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PickupTierDto)
  tiers: PickupTierDto[];
}

export class UpdatePickupTariffDto {
  @IsOptional() @IsString() @MaxLength(150) name?: string;
  @IsOptional() @IsUUID() countryId?: string;
  @IsOptional() @IsUUID() cityId?: string | null;
  @IsOptional() @IsString() @MaxLength(10) currency?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;

  /** Si fourni : REMPLACE entièrement les paliers existants */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PickupTierDto)
  tiers?: PickupTierDto[];
}

/** Ajout / modification d'un seul palier */
export class UpsertPickupTierDto {
  @Type(() => Number) @IsInt() @Min(0) minValue: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxValue?: number | null;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) price: number;
}

/** Filtres de liste */
export class ListPickupTariffDto {
  @IsOptional() @IsUUID() countryId?: string;
  @IsOptional() @IsUUID() cityId?: string;
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  activeOnly?: boolean;
}

/** Calcul du tarif de ramassage selon le POIDS */
export class QuotePickupDto {
  @IsUUID() countryId: string;
  @IsOptional() @IsUUID() cityId?: string;
  /** Poids (kg) à situer dans les paliers */
  @Type(() => Number) @IsNumber() @Min(0) weight: number;
}
