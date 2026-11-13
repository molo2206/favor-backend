import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transmission } from 'src/products/enum/transmission.enum';
import {
  VehicleEngineCondition,
  VehicleOriginality,
  VehicleRegistrationStatus,
  VehicleRegistrationType,
} from '../enums/vehicle-registration.enum';

// ---------- multipart/form-data : tout arrive en texte ----------

/** "" → absent ; "12.5" → 12.5 ; texte invalide → laissé tel quel (refusé par la validation) */
const toNum = ({ value }: { value: any }) => {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : value;
};

/** Champ texte : espaces retirés, "" → absent */
const toText = ({ value }: { value: any }) =>
  value === undefined || value === null ? undefined : String(value).trim() === '' ? undefined : String(value).trim();

/** Téléphone : espaces, tirets, points et parenthèses retirés */
const toPhone = ({ value }: { value: any }) =>
  value === undefined || value === null || value === '' ? undefined : String(value).trim().replace(/[\s\-().]/g, '');

/** Liste : tableau, JSON '["A","B"]' ou "A,B" */
const toList = ({ value }: { value: any }) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  const s = String(value).trim();
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s);
      return Array.isArray(arr) ? arr.map((v) => String(v).trim()).filter(Boolean) : value;
    } catch {
      return value;
    }
  }
  return s.split(',').map((v) => v.trim()).filter(Boolean);
};

/** Énumération : en majuscules, "" → absent */
const toUpper = ({ value }: { value: any }) =>
  value === undefined || value === null || value === '' ? undefined : String(value).trim().toUpperCase();

const PHONE = /^\+?[0-9]{8,15}$/;

/** Enregistrement d'un véhicule (+ images dans le champ multipart « images ») */
export class CreateVehicleRegistrationDto {
  // ---------- Véhicule ----------

  /** Nom du véhicule */
  @Transform(toText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  /** Marque */
  @Transform(toText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  brand: string;

  /** Année */
  @IsOptional()
  @Transform(toNum)
  @IsInt()
  @Min(1900)
  @Max(2100)
  year?: number;

  @IsOptional()
  @Transform(toText)
  @IsString()
  @MaxLength(50)
  color?: string;

  @IsOptional()
  @Transform(toUpper)
  @IsEnum(Transmission)
  transmission?: Transmission;

  /** Kilométrage (km) */
  @IsOptional()
  @Transform(toNum)
  @IsInt()
  @Min(0)
  mileage?: number;

  /** Plaque d'immatriculation */
  @IsOptional()
  @Transform(toText)
  @IsString()
  @MaxLength(30)
  plateNumber?: string;

  /** État du moteur */
  @IsOptional()
  @Transform(toUpper)
  @IsEnum(VehicleEngineCondition)
  engineCondition?: VehicleEngineCondition;

  /** Originalité : ORIGINAL (ni modifié ni accidenté), MODIFIED, ACCIDENTED, MODIFIED_AND_ACCIDENTED */
  @IsOptional()
  @Transform(toUpper)
  @IsEnum(VehicleOriginality)
  originality?: VehicleOriginality;

  /** Documents disponibles : ["CARTE_GRISE","ASSURANCE"] ou "CARTE_GRISE,ASSURANCE" */
  @IsOptional()
  @Transform(toList)
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  availableDocuments?: string[];

  // ---------- Localisation ----------

  @IsOptional()
  @Transform(toText)
  @IsString()
  @MaxLength(255)
  locationAddress?: string;

  @IsOptional()
  @Transform(toText)
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @Transform(toNum)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @Transform(toNum)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  // ---------- Type et prix (intervalle min – max) ----------

  /** SALE (vente) ou RENTAL (location) */
  @Transform(toUpper)
  @IsEnum(VehicleRegistrationType)
  registrationType: VehicleRegistrationType;

  /** Prix minimum */
  @Transform(toNum)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  priceMin: number;

  /** Prix maximum (≥ prix minimum ; absent = prix minimum) */
  @IsOptional()
  @Transform(toNum)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  priceMax?: number;

  /** Devise (USD par défaut) */
  @IsOptional()
  @Transform(toUpper)
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  // ---------- Propriétaire ----------

  @Transform(toText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  ownerName: string;

  @IsOptional()
  @Transform(toText)
  @IsString()
  @MaxLength(255)
  ownerAddress?: string;

  @Transform(toPhone)
  @Matches(PHONE)
  ownerPhone: string;

  // ---------- Commissionnaire (facultatif) ----------

  @IsOptional()
  @Transform(toText)
  @IsString()
  @MaxLength(150)
  brokerName?: string;

  @IsOptional()
  @Transform(toPhone)
  @Matches(PHONE)
  brokerPhone?: string;

  /** Montant lié au commissionnaire (même devise que le prix) */
  @IsOptional()
  @Transform(toNum)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  brokerAmount?: number;

  // ---------- Divers ----------

  @IsOptional()
  @Transform(toUpper)
  @IsEnum(VehicleRegistrationStatus)
  status?: VehicleRegistrationStatus;

  @IsOptional()
  @Transform(toText)
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

/** Modification (tous les champs facultatifs) + nouvelles images (champ « images ») */
export class UpdateVehicleRegistrationDto extends PartialType(CreateVehicleRegistrationDto) {
  /** URL des images à supprimer : ["https://…/a.webp"] ou "url1,url2" */
  @IsOptional()
  @Transform(toList)
  @IsArray()
  @IsString({ each: true })
  removeImages?: string[];

  /** "true" = retirer le commissionnaire (nom, téléphone, montant) */
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : value === true || value === 'true' || value === '1'))
  clearBroker?: boolean;
}

export class UpdateVehicleRegistrationStatusDto {
  @Transform(toUpper)
  @IsEnum(VehicleRegistrationStatus)
  status: VehicleRegistrationStatus;

  @IsOptional()
  @Transform(toText)
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class VehicleRegistrationQueryDto {
  @IsOptional()
  @Transform(toUpper)
  @IsEnum(VehicleRegistrationType)
  registrationType?: VehicleRegistrationType;

  @IsOptional()
  @Transform(toUpper)
  @IsEnum(VehicleRegistrationStatus)
  status?: VehicleRegistrationStatus;

  @IsOptional()
  @Transform(toUpper)
  @IsEnum(Transmission)
  transmission?: Transmission;

  @IsOptional()
  @Transform(toText)
  @IsString()
  brand?: string;

  @IsOptional()
  @Transform(toText)
  @IsString()
  city?: string;

  @IsOptional()
  @Transform(toNum)
  @IsInt()
  yearMin?: number;

  @IsOptional()
  @Transform(toNum)
  @IsInt()
  yearMax?: number;

  /** Budget : véhicules dont l'intervalle de prix croise [priceFrom, priceTo] */
  @IsOptional()
  @Transform(toNum)
  @IsNumber()
  priceFrom?: number;

  @IsOptional()
  @Transform(toNum)
  @IsNumber()
  priceTo?: number;

  @IsOptional()
  @Transform(toUpper)
  @IsString()
  currency?: string;

  /** Avec ou sans commissionnaire */
  @IsOptional()
  @IsIn(['true', 'false'])
  hasBroker?: 'true' | 'false';

  /** Nom, marque, plaque, référence, propriétaire, commissionnaire, adresse */
  @IsOptional()
  @Transform(toText)
  @IsString()
  search?: string;

  /** Admin : véhicules enregistrés par un utilisateur précis */
  @IsOptional()
  @IsUUID()
  createdById?: string;

  @IsOptional()
  @Transform(toNum)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(toNum)
  @IsInt()
  @Min(1)
  limit?: number;
}
