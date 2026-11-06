import { Transform } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

/** "A,B" ou ["A","B"] → ["A","B"] (majuscules) ; vide → absent */
const toUpperList = ({ value }: { value: any }) => {
  if (value === undefined || value === null || value === '') return undefined;
  const arr = Array.isArray(value) ? value : String(value).split(',');
  const list = arr.map((v) => String(v).trim().toUpperCase()).filter(Boolean);
  return list.length ? list : undefined;
};
const toText = ({ value }: { value: any }) =>
  value === undefined || value === null || String(value).trim() === '' ? undefined : String(value).trim();
const toInt = ({ value }: { value: any }) =>
  value === undefined || value === null || value === '' ? undefined : Number(value);

const DATE = /^\d{4}-\d{2}-\d{2}(T.*)?$/;

/**
 * ✅ Filtres du tableau de bord des courses taxi (admin) — tous facultatifs.
 * Période : from / to (YYYY-MM-DD, date de création de la course). Sans période : 30 derniers jours.
 */
export class RideAdminFilterDto {
  @IsOptional()
  @Transform(toText)
  @Matches(DATE, { message: 'from doit être au format YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @Transform(toText)
  @Matches(DATE, { message: 'to doit être au format YYYY-MM-DD' })
  to?: string;

  /** Chauffeur */
  @IsOptional()
  @Transform(toText)
  @IsString()
  driverId?: string;

  /** Passager */
  @IsOptional()
  @Transform(toText)
  @IsString()
  riderId?: string;

  @IsOptional()
  @Transform(toText)
  @IsString()
  cityId?: string;

  /** Catégorie de véhicule (Standard, Confort…) */
  @IsOptional()
  @Transform(toText)
  @IsString()
  categoryId?: string;

  /** Association de chauffeurs */
  @IsOptional()
  @Transform(toText)
  @IsString()
  associationId?: string;

  @IsOptional()
  @Transform(toText)
  @IsString()
  vehicleId?: string;

  /** PENDING, SEARCHING, ACCEPTED, ARRIVED, IN_PROGRESS, COMPLETED, CANCELLED (plusieurs : "COMPLETED,CANCELLED") */
  @IsOptional()
  @Transform(toUpperList)
  @IsArray()
  status?: string[];

  /** CASH, MOBILE_MONEY, FPAY, CARD, BANK, MANUAL */
  @IsOptional()
  @Transform(toUpperList)
  @IsArray()
  paymentMethod?: string[];

  /** PENDING, PROCESSING, PAID, FAILED */
  @IsOptional()
  @Transform(toUpperList)
  @IsArray()
  paymentStatus?: string[];

  /** USD, CDF… */
  @IsOptional()
  @Transform(({ value }) => (toText({ value }) ? String(value).trim().toUpperCase() : undefined))
  @IsString()
  currency?: string;

  /** Qui a annulé : RIDER, DRIVER, SYSTEM */
  @IsOptional()
  @Transform(({ value }) => (toText({ value }) ? String(value).trim().toUpperCase() : undefined))
  @IsIn(['RIDER', 'DRIVER', 'SYSTEM'])
  cancelledBy?: string;

  /** Nom / téléphone du chauffeur ou du passager, référence de la course (8 premiers caractères) */
  @IsOptional()
  @Transform(toText)
  @IsString()
  search?: string;

  /** Regroupement de la courbe : day | week | month (défaut : automatique selon la période) */
  @IsOptional()
  @Transform(({ value }) => (toText({ value }) ? String(value).trim().toLowerCase() : undefined))
  @IsIn(['day', 'week', 'month'])
  groupBy?: 'day' | 'week' | 'month';
}

/** Liste paginée des courses */
export class RideAdminListQueryDto extends RideAdminFilterDto {
  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  /** createdAt (défaut) | price | distance | completedAt */
  @IsOptional()
  @Transform(({ value }) => toText({ value }))
  @IsIn(['createdAt', 'price', 'distance', 'completedAt'])
  sortBy?: 'createdAt' | 'price' | 'distance' | 'completedAt';

  @IsOptional()
  @Transform(({ value }) => (toText({ value }) ? String(value).trim().toUpperCase() : undefined))
  @IsIn(['ASC', 'DESC'])
  sortDir?: 'ASC' | 'DESC';
}

/** Liste des chauffeurs (sélecteur du filtre) */
export class RideAdminDriversQueryDto {
  @IsOptional()
  @Transform(toText)
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

/** Commissions des courses en espèces */
export class RideCashCommissionQueryDto {
  @IsOptional()
  @Transform(toText)
  @Matches(DATE)
  from?: string;

  @IsOptional()
  @Transform(toText)
  @Matches(DATE)
  to?: string;

  @IsOptional()
  @Transform(toText)
  @IsString()
  driverId?: string;

  @IsOptional()
  @Transform(({ value }) => (toText({ value }) ? String(value).trim().toUpperCase() : undefined))
  @IsString()
  currency?: string;

  /** Crédit du compte TAXI : PENDING, SUCCESS, FAILED, DISABLED */
  @IsOptional()
  @Transform(({ value }) => (toText({ value }) ? String(value).trim().toUpperCase() : undefined))
  @IsIn(['PENDING', 'SUCCESS', 'FAILED', 'DISABLED'])
  taxiCreditStatus?: string;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
