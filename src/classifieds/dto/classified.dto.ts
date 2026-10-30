import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CompanyType } from 'src/company/enum/type.company.enum';
import { FuelType } from 'src/products/enum/fuelType_enum';
import { Transmission } from 'src/products/enum/transmission.enum';
import { Type_rental_both_sale_car } from 'src/products/enum/type_rental_both_sale_car';
import {
  ClassifiedCondition,
  ClassifiedPaymentMethod,
  ClassifiedReportReason,
  ClassifiedReportStatus,
  ClassifiedStatus,
} from '../enums/classified.enums';

/** multipart/form-data : "true"/"false"/"1"/"0" → booléen */
const toBool = ({ value }: { value: any }) =>
  value === undefined || value === null || value === '' ? undefined : value === true || value === 'true' || value === '1';

/** multipart/form-data : champ JSON envoyé en texte */
const toJson = ({ value }: { value: any }) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const toList = ({ value }: { value: any }) =>
  value === undefined || value === null || value === ''
    ? undefined
    : Array.isArray(value)
      ? value
      : String(value).trim().startsWith('[')
        ? toJson({ value })
        : String(value).split(',').map((v) => v.trim()).filter(Boolean);

const cleanPhone = ({ value }: { value: any }) =>
  value === undefined || value === null || value === '' ? undefined : String(value).trim().replace(/[\s\-().]/g, '');

const PHONE = /^\+?[0-9]{8,15}$/;

// ============================================================
// ANNONCES (lignes de la table `products`, listingType = CLASSIFIED)
// ============================================================
/**
 * Type de produit de l'annonce = colonne `products.type` (mêmes valeurs que les produits d'entreprise).
 * ✅ Les tarifs de publication sont fixés PAR TYPE DE PRODUIT (classified_pricing_plans.productType).
 */
export const CLASSIFIED_TYPES = [
  CompanyType.RESTAURANT,
  CompanyType.CAR,
  CompanyType.GROCERY,
  CompanyType.SHOP,
  CompanyType.SERVICE,
  CompanyType.HOTEL,
  CompanyType.SHIPPING,
  CompanyType.AGENCE,
] as const;
export type ClassifiedProductType = (typeof CLASSIFIED_TYPES)[number];

/** "" ou "ALL" → null (tarif valable pour tous les types de produit) ; sinon en majuscules */
const toProductType = ({ value }: { value: any }) => {
  if (value === undefined) return undefined;
  if (value === null || value === '' || String(value).toUpperCase() === 'ALL') return null;
  return String(value).trim().toUpperCase();
};

export class CreateClassifiedDto {
  /** Titre de l'annonce (= products.name) */
  @IsString() @MinLength(3) @MaxLength(500)
  name: string;

  @IsString() @MinLength(10) @MaxLength(5000)
  description: string;

  @IsUUID()
  categoryId: string;

  @IsUUID()
  cityId: string;

  /** Défaut SHOP ; CAR pour un véhicule (champs voiture ci-dessous) */
  @IsOptional() @IsIn(CLASSIFIED_TYPES as unknown as string[])
  type?: CompanyType;

  /** Quartier / commune / adresse (= products.localization) */
  @IsOptional() @IsString() @MaxLength(255)
  location?: string;

  /** Vide = « prix sur demande » */
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  price?: number;

  @IsOptional() @IsString() @MaxLength(10)
  currency?: string;

  @IsOptional() @Transform(toBool) @IsBoolean()
  negotiable?: boolean;

  @IsOptional() @IsEnum(ClassifiedCondition)
  condition?: ClassifiedCondition;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  quantity?: number;

  // ----- Champs existants des produits (facultatifs) -----
  @IsOptional() @IsUUID()
  brandId?: string;

  @IsOptional() @IsString() @MaxLength(100)
  model?: string;

  @IsOptional() @IsString() @MaxLength(10)
  year?: string;

  @IsOptional() @IsString() @MaxLength(50)
  color?: string;

  @IsOptional() @IsEnum(FuelType)
  fuelType?: FuelType;

  @IsOptional() @IsEnum(Transmission)
  transmission?: Transmission;

  /** Véhicule : vente / location / les deux */
  @IsOptional() @IsEnum(Type_rental_both_sale_car)
  typecar?: Type_rental_both_sale_car;

  // ----- Contact -----
  /** Défaut : téléphone du compte */
  @IsOptional() @Transform(cleanPhone) @Matches(PHONE)
  contactPhone?: string;

  @IsOptional() @Transform(cleanPhone) @Matches(PHONE)
  whatsapp?: string;

  @IsOptional() @Transform(toBool) @IsBoolean()
  showPhone?: boolean;
}

export class UpdateClassifiedDto extends PartialType(CreateClassifiedDto) {
  /** Photos à supprimer (ids de images_product) */
  @IsOptional() @Transform(toList) @IsArray() @Type(() => Number) @IsInt({ each: true })
  removeImageIds?: number[];

  /** Photo de couverture (= products.image) */
  @IsOptional() @Type(() => Number) @IsInt()
  coverImageId?: number;
}

export const CLASSIFIED_SORTS = ['recent', 'price_asc', 'price_desc', 'popular'] as const;

export class ClassifiedSearchDto {
  @IsOptional() @IsString() @MaxLength(100)
  keyword?: string;

  /** Inclut les sous-catégories */
  @IsOptional() @IsUUID()
  categoryId?: string;

  @IsOptional() @IsUUID()
  cityId?: string;

  @IsOptional() @IsUUID()
  countryId?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  minPrice?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  maxPrice?: number;

  @IsOptional() @IsString() @MaxLength(10)
  currency?: string;

  @IsOptional() @IsEnum(ClassifiedCondition)
  condition?: ClassifiedCondition;

  @IsOptional() @Transform(toBool) @IsBoolean()
  negotiable?: boolean;

  @IsOptional() @Transform(toBool) @IsBoolean()
  featuredOnly?: boolean;

  /** Annonces d'un vendeur */
  @IsOptional() @IsUUID()
  userId?: string;

  @IsOptional() @IsIn(CLASSIFIED_TYPES as unknown as string[])
  type?: CompanyType;

  @IsOptional() @IsUUID()
  brandId?: string;

  @IsOptional() @IsEnum(Type_rental_both_sale_car)
  typecar?: Type_rental_both_sale_car;

  @IsOptional() @IsString() @MaxLength(10)
  year?: string;

  @IsOptional() @IsIn(CLASSIFIED_SORTS as unknown as string[])
  sort?: (typeof CLASSIFIED_SORTS)[number];

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;
}

export class MyClassifiedsQueryDto {
  @IsOptional() @IsEnum(ClassifiedStatus)
  status?: ClassifiedStatus;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;
}

// ============================================================
// TARIFS & PAIEMENT
// ============================================================
export class PricingQueryDto {
  @IsUUID()
  cityId: string;

  @IsOptional() @IsUUID()
  categoryId?: string;

  /** ✅ Type de produit de l'annonce (RESTAURANT, CAR, GROCERY, SHOP, SERVICE, HOTEL, SHIPPING, AGENCE) */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value ? value.trim().toUpperCase() : undefined))
  @IsIn(CLASSIFIED_TYPES as unknown as string[])
  type?: ClassifiedProductType;
}

export class PayClassifiedDto {
  @IsUUID()
  planId: string;

  @IsEnum(ClassifiedPaymentMethod)
  paymentMethod: ClassifiedPaymentMethod;

  /** FPAY : jeton FPay du client */
  @IsOptional() @IsString()
  access_token?: string;

  /** MOBILE_MONEY : opérateur Pawapay (ex. VODACOM_MPESA_COD, AIRTEL_COD, ORANGE_COD) */
  @IsOptional() @IsString() @MaxLength(60)
  provider?: string;

  /** MOBILE_MONEY : numéro qui paie (ex. 243970000000) */
  @IsOptional() @Transform(cleanPhone) @Matches(PHONE)
  phone?: string;

  /** ✅ Frais de transaction calculés et envoyés par le front (ajoutés au prix du forfait) */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  transactionFee?: number;

  /** ✅ Taux utilisé par le front pour calculer transactionFee (enregistré) */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  appliedFeeRate?: number;

  /** ✅ Devise envoyée par le front (sinon celle du forfait) */
  @IsOptional() @IsIn(['USD', 'CDF', 'XAF', 'XOF'])
  currency?: string;

  /** ✅ Moyen de paiement enregistré de l'utilisateur (Mobile Money ou FPay) */
  @IsOptional() @IsUUID()
  paymentMethodId?: string;
}

export class CreatePricingPlanDto {
  @IsString() @Matches(/^[A-Z0-9_]{2,50}$/)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  code: string;

  @IsString() @MinLength(2) @MaxLength(120)
  name: string;

  @IsOptional() @IsString() @MaxLength(500)
  description?: string;

  /** Vide = toutes les villes */
  @IsOptional() @IsUUID()
  cityId?: string;

  @IsOptional() @IsUUID()
  countryId?: string;

  @IsOptional() @IsUUID()
  categoryId?: string;

  /**
   * ✅ Type de produit auquel le tarif s'applique : RESTAURANT, CAR, GROCERY, SHOP, SERVICE, HOTEL, SHIPPING, AGENCE.
   * Vide / null / "ALL" = tous les types de produit.
   */
  @IsOptional()
  @Transform(toProductType)
  @IsIn(CLASSIFIED_TYPES as unknown as string[])
  productType?: ClassifiedProductType | null;

  @Type(() => Number) @IsInt() @Min(1) @Max(365)
  durationDays: number;

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  price: number;

  @IsOptional() @IsString() @MaxLength(10)
  currency?: string;

  @IsOptional() @Transform(toBool) @IsBoolean()
  isFeatured?: boolean;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(30)
  maxImages?: number;

  @IsOptional() @Transform(toBool) @IsBoolean()
  isActive?: boolean;

  @IsOptional() @Type(() => Number) @IsInt()
  sortOrder?: number;
}

export class UpdatePricingPlanDto extends PartialType(CreatePricingPlanDto) { }

export class PricingPlanQueryDto {
  @IsOptional() @IsUUID() cityId?: string;
  @IsOptional() @IsUUID() countryId?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  /** ✅ Tarifs d'un type de produit ; "ALL" = seulement les tarifs valables pour tous les types */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value ? value.trim().toUpperCase() : undefined))
  @IsIn([...(CLASSIFIED_TYPES as unknown as string[]), 'ALL'])
  productType?: ClassifiedProductType | 'ALL';
  @IsOptional() @IsString() code?: string;
  @IsOptional() @Transform(toBool) @IsBoolean() isActive?: boolean;
  /** true = seulement les tarifs généraux (sans ville) */
  @IsOptional() @Transform(toBool) @IsBoolean() globalOnly?: boolean;
}

// ============================================================
// ✅ TARIF = nom + durée + devise  →  tableau  Type | Prix
// ============================================================
/** Zone des tarifs : générale (rien), un pays ou une ville — catégorie facultative */
export class TariffZoneDto {
  @IsOptional() @IsUUID() cityId?: string;
  @IsOptional() @IsUUID() countryId?: string;
  @IsOptional() @IsUUID() categoryId?: string;
}

/** Une ligne du tableau du tarif : Type | Prix */
export class TariffPriceDto {
  /** RESTAURANT, CAR, GROCERY, SHOP, SERVICE, HOTEL, SHIPPING, AGENCE (ou ALL = tous les types) */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsIn([...(CLASSIFIED_TYPES as unknown as string[]), 'ALL'])
  type: ClassifiedProductType | 'ALL';

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  price: number;
}

export class CreateTariffDto extends TariffZoneDto {
  /** Nom du tarif (ex. « Standard 7 jours ») */
  @IsString() @MinLength(2) @MaxLength(120)
  name: string;

  /** Code facultatif (sinon créé à partir du nom) */
  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9_]{2,50}$/)
  @Transform(({ value }) => (typeof value === 'string' && value ? value.trim().toUpperCase() : undefined))
  code?: string;

  @IsOptional() @IsString() @MaxLength(500)
  description?: string;

  /** Durée de mise en ligne (jours) */
  @Type(() => Number) @IsInt() @Min(1) @Max(365)
  durationDays: number;

  /** Devise (USD, CDF…) */
  @IsOptional() @IsString() @MaxLength(10)
  currency?: string;

  @IsOptional() @Transform(toBool) @IsBoolean()
  isFeatured?: boolean;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(30)
  maxImages?: number;

  @IsOptional() @Type(() => Number) @IsInt()
  sortOrder?: number;

  /** Tableau Type | Prix */
  @IsArray() @ValidateNested({ each: true }) @Type(() => TariffPriceDto)
  prices: TariffPriceDto[];
}

/** Modification : tous les champs facultatifs ; `prices` envoyé = remplace tout le tableau */
export class UpdateTariffDto extends PartialType(CreateTariffDto) { }

// ============================================================
// FAVORIS, SIGNALEMENTS, MODÉRATION
// ============================================================
export class ReportClassifiedDto {
  @IsEnum(ClassifiedReportReason)
  reason: ClassifiedReportReason;

  @IsOptional() @IsString() @MaxLength(1000)
  message?: string;
}

export class RejectClassifiedDto {
  @IsString() @IsNotEmpty() @MaxLength(500)
  reason: string;
}

export class AdminClassifiedQueryDto {
  @IsOptional() @IsEnum(ClassifiedStatus) status?: ClassifiedStatus;
  @IsOptional() @IsUUID() cityId?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class HandleReportDto {
  @IsIn([ClassifiedReportStatus.RESOLVED, ClassifiedReportStatus.DISMISSED])
  status: ClassifiedReportStatus.RESOLVED | ClassifiedReportStatus.DISMISSED;

  @IsOptional() @IsString() @MaxLength(500)
  resolution?: string;

  /** Retirer l'annonce (passe en REJECTED) */
  @IsOptional() @Transform(toBool) @IsBoolean()
  takeDown?: boolean;
}

export class ReportsQueryDto {
  @IsOptional() @IsEnum(ClassifiedReportStatus) status?: ClassifiedReportStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

/** Validation manuelle d'un paiement (espèces / agence) */
export class ManualPaymentDto {
  @IsUUID()
  planId: string;

  @IsOptional() @IsString() @MaxLength(100)
  reference?: string;
}

export class RevenueQueryDto {
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @IsUUID() cityId?: string;
}
