import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
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
import {
  CASH_APPROVER_ROLES,
  CashApprovalScope,
  CashApprovalStatus,
  CashApprovalTarget,
  CASH_PAYMENT_METHODS,
  CashAccountType,
  CashActivity,
  CashDirection,
  CashTransactionStatus,
  FinanceRole,
} from '../common/cash-flow.enums';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD = /^\d{4}-\d{2}$/;
const DATE_MSG = { message: 'Date attendue au format AAAA-MM-JJ' };
const PERIOD_MSG = { message: 'Mois attendu au format AAAA-MM' };

const trim = ({ value }: { value: any }) => (typeof value === 'string' ? value.trim() : value);
/** multipart/form-data : "12.5" → 12.5 ; "" → absent */
const toNum = ({ value }: { value: any }) => (value === '' || value === null || value === undefined ? undefined : Number(value));
const toBool = ({ value }: { value: any }) =>
  value === undefined || value === null || value === '' ? undefined : value === true || value === 'true' || value === '1';
const upper = ({ value }: { value: any }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);
/** multipart : '["a","b"]' ou "a,b" → tableau */
const toArray = ({ value }: { value: any }) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value;
  try {
    const v = JSON.parse(value);
    if (Array.isArray(v)) return v;
  } catch {
    /* "a,b" */
  }
  return String(value).split(',').map((s) => s.trim()).filter(Boolean);
};

/** Entreprise (facultatif : entreprise active de l'utilisateur) */
export class CompanyQueryDto {
  @IsOptional() @IsUUID() companyId?: string;
}

// ============================================================
// ÉQUIPE FINANCE
// ============================================================
export class AddFinanceMemberDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsUUID() userId: string;
  @IsEnum(FinanceRole) role: FinanceRole;
  /** Caissier : comptes autorisés (vide = tous) */
  @IsOptional() @Transform(toArray) @IsArray() @ArrayMaxSize(50) @IsUUID('all', { each: true }) accountIds?: string[];
}

export class UpdateFinanceMemberDto {
  @IsOptional() @IsEnum(FinanceRole) role?: FinanceRole;
  @IsOptional() @Transform(toArray) @IsArray() @ArrayMaxSize(50) @IsUUID('all', { each: true }) accountIds?: string[];
}

// ============================================================
// COMPTES
// ============================================================
export class CreateCashAccountDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(150) name: string;
  @IsEnum(CashAccountType) type: CashAccountType;
  @Transform(upper) @IsString() @MinLength(3) @MaxLength(10) currency: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(150) bankName?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) accountNumber?: string;
  @IsOptional() @Transform(toNum) @IsNumber({ maxDecimalPlaces: 2 }) openingBalance?: number;
  @IsOptional() @Matches(DATE, DATE_MSG) openingDate?: string;
  @IsOptional() @Transform(toBool) @IsBoolean() allowNegative?: boolean;
  @IsOptional() @Transform(toNum) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) minBalance?: number;
  @IsOptional() @Transform(toBool) @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsString() @MaxLength(20) color?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class UpdateCashAccountDto {
  @IsOptional() @IsUUID() branchId?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(150) name?: string;
  @IsOptional() @IsEnum(CashAccountType) type?: CashAccountType;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(150) bankName?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) accountNumber?: string;
  /** Modifiable seulement tant qu'aucun arrêté de caisse n'existe */
  @IsOptional() @Transform(toNum) @IsNumber({ maxDecimalPlaces: 2 }) openingBalance?: number;
  @IsOptional() @Matches(DATE, DATE_MSG) openingDate?: string;
  @IsOptional() @Transform(toBool) @IsBoolean() allowNegative?: boolean;
  @IsOptional() @Transform(toNum) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) minBalance?: number;
  @IsOptional() @Transform(toBool) @IsBoolean() isDefault?: boolean;
  @IsOptional() @Transform(toBool) @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() @MaxLength(20) color?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class CashAccountQueryDto extends CompanyQueryDto {
  @IsOptional() @IsEnum(CashAccountType) type?: CashAccountType;
  @IsOptional() @Transform(upper) @IsString() currency?: string;
  @IsOptional() @IsUUID() branchId?: string;
  /** true (défaut) : actifs ; false : désactivés ; all : tous */
  @IsOptional() @IsIn(['true', 'false', 'all']) active?: 'true' | 'false' | 'all';
}

// ============================================================
// RUBRIQUES
// ============================================================
export class CreateCashCategoryDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsUUID() parentId?: string;
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(150) name: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(40) code?: string;
  @IsEnum(CashDirection) direction: CashDirection;
  @IsOptional() @IsEnum(CashActivity) activity?: CashActivity;
  @IsOptional() @IsString() @MaxLength(20) color?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) position?: number;
}

export class UpdateCashCategoryDto {
  @IsOptional() @IsUUID() parentId?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(150) name?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(40) code?: string;
  @IsOptional() @IsEnum(CashActivity) activity?: CashActivity;
  @IsOptional() @IsString() @MaxLength(20) color?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) position?: number;
  @IsOptional() @Transform(toBool) @IsBoolean() isActive?: boolean;
}

export class CashCategoryQueryDto extends CompanyQueryDto {
  @IsOptional() @IsEnum(CashDirection) direction?: CashDirection;
  @IsOptional() @IsEnum(CashActivity) activity?: CashActivity;
  @IsOptional() @IsIn(['true', 'false', 'all']) active?: 'true' | 'false' | 'all';
}

// ============================================================
// MOUVEMENTS
// ============================================================
/** Entrée ou sortie (multipart possible : champ fichier `attachment` = reçu / facture) */
export class CreateCashTransactionDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsUUID() accountId: string;
  @IsEnum(CashDirection) direction: CashDirection;
  @IsOptional() @IsUUID() categoryId?: string;
  @Transform(toNum) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount: number;
  /** Par défaut : aujourd'hui */
  @IsOptional() @Matches(DATE, DATE_MSG) transactionDate?: string;
  @IsOptional() @IsIn(CASH_PAYMENT_METHODS as unknown as string[]) paymentMethod?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(150) counterpartyName?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(40) counterpartyPhone?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) description?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) documentNumber?: string;
  /** Justificatif déjà en ligne (sinon fichier `attachment`) */
  @IsOptional() @IsString() @MaxLength(500) attachmentUrl?: string;
  @IsOptional() @IsUUID() branchId?: string;
  /** Lien vers un autre module (ORDER, SHIPMENT, PAYROLL, FUEL…) */
  @IsOptional() @Transform(upper) @IsString() @MaxLength(40) sourceType?: string;
  @IsOptional() @IsString() @MaxLength(36) sourceId?: string;
}

export class UpdateCashTransactionDto {
  @IsOptional() @IsUUID() categoryId?: string | null;
  @IsOptional() @Transform(toNum) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount?: number;
  @IsOptional() @Matches(DATE, DATE_MSG) transactionDate?: string;
  @IsOptional() @IsIn(CASH_PAYMENT_METHODS as unknown as string[]) paymentMethod?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(150) counterpartyName?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(40) counterpartyPhone?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) description?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) documentNumber?: string;
  @IsOptional() @IsString() @MaxLength(500) attachmentUrl?: string;
  /** Supprimer le justificatif */
  @IsOptional() @Transform(toBool) @IsBoolean() removeAttachment?: boolean;
}

export class CashTransactionQueryDto extends CompanyQueryDto {
  @IsOptional() @IsUUID() accountId?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsEnum(CashDirection) direction?: CashDirection;
  @IsOptional() @IsEnum(CashTransactionStatus) status?: CashTransactionStatus;
  @IsOptional() @IsEnum(CashActivity) activity?: CashActivity;
  @IsOptional() @Transform(upper) @IsString() currency?: string;
  @IsOptional() @IsIn(CASH_PAYMENT_METHODS as unknown as string[]) paymentMethod?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() createdById?: string;
  /** true : transferts internes seulement ; false : sans les transferts */
  @IsOptional() @IsIn(['true', 'false']) transfers?: 'true' | 'false';
  @IsOptional() @Matches(DATE, DATE_MSG) from?: string;
  @IsOptional() @Matches(DATE, DATE_MSG) to?: string;
  @IsOptional() @Transform(toNum) @IsNumber() minAmount?: number;
  @IsOptional() @Transform(toNum) @IsNumber() maxAmount?: number;
  /** Référence, description, tiers, n° de document */
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsIn(['transactionDate', 'amount', 'createdAt']) sortBy?: 'transactionDate' | 'amount' | 'createdAt';
  @IsOptional() @IsIn(['ASC', 'DESC']) sortOrder?: 'ASC' | 'DESC';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

export class RejectCashTransactionDto {
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(500) reason: string;
}

export class CancelCashTransactionDto {
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(500) reason: string;
}

export class BulkValidateDto {
  @IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true }) ids: string[];
}

// ============================================================
// TRANSFERTS
// ============================================================
export class CreateCashTransferDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsUUID() fromAccountId: string;
  @IsUUID() toAccountId: string;
  /** Montant sorti (devise du compte de départ) */
  @Transform(toNum) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount: number;
  /** Devises différentes : taux (1 unité de départ = X unités d'arrivée). Sinon taux de la table exchange_rates */
  @IsOptional() @Transform(toNum) @IsNumber() @Min(0.000001) exchangeRate?: number;
  /** Ou directement le montant reçu */
  @IsOptional() @Transform(toNum) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) receivedAmount?: number;
  @IsOptional() @Transform(toNum) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) fees?: number;
  @IsOptional() @Matches(DATE, DATE_MSG) transferDate?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) description?: string;
}

// ============================================================
// PRÉVISIONS
// ============================================================
export class ForecastLineDto {
  @IsUUID() categoryId: string;
  @Matches(PERIOD, PERIOD_MSG) period: string;
  @Transform(toNum) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) amount: number;
  @IsOptional() @Transform(upper) @IsString() @MaxLength(10) currency?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

/** Enregistre plusieurs prévisions (création ou mise à jour ; montant 0 = suppression) */
export class UpsertForecastsDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => ForecastLineDto) lines: ForecastLineDto[];
}

/** Recopier les prévisions d'un mois vers d'autres mois */
export class CopyForecastsDto {
  @IsOptional() @IsUUID() companyId?: string;
  @Matches(PERIOD, PERIOD_MSG) fromPeriod: string;
  @IsArray() @ArrayMaxSize(24) @Matches(PERIOD, { each: true, ...PERIOD_MSG }) toPeriods: string[];
  /** Remplacer les prévisions déjà saisies sur ces mois (défaut : non) */
  @IsOptional() @IsBoolean() overwrite?: boolean;
}

export class ForecastQueryDto extends CompanyQueryDto {
  @IsOptional() @Matches(PERIOD, PERIOD_MSG) fromPeriod?: string;
  @IsOptional() @Matches(PERIOD, PERIOD_MSG) toPeriod?: string;
  @IsOptional() @Transform(upper) @IsString() currency?: string;
}

// ============================================================
// ARRÊTÉS DE CAISSE
// ============================================================
export class DenominationDto {
  @Type(() => Number) @IsNumber() @Min(0) value: number;
  @Type(() => Number) @IsInt() @Min(0) count: number;
}

export class CreateCashClosingDto {
  @IsUUID() accountId: string;
  /** Par défaut : aujourd'hui */
  @IsOptional() @Matches(DATE, DATE_MSG) closingDate?: string;
  /** Solde compté (ou calculé à partir du billetage) */
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) countedBalance?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => DenominationDto) denominations?: DenominationDto[];
  /** Régulariser l'écart par un mouvement « Écart de caisse » (responsable financier) */
  @IsOptional() @IsBoolean() adjust?: boolean;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class CashClosingQueryDto extends CompanyQueryDto {
  @IsOptional() @IsUUID() accountId?: string;
  @IsOptional() @Matches(DATE, DATE_MSG) from?: string;
  @IsOptional() @Matches(DATE, DATE_MSG) to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

// ============================================================
// RAPPORTS
// ============================================================
export class CashReportQueryDto extends CompanyQueryDto {
  @IsOptional() @Matches(DATE, DATE_MSG) from?: string;
  @IsOptional() @Matches(DATE, DATE_MSG) to?: string;
  @IsOptional() @IsUUID() accountId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  /** Devise des totaux convertis (taux exchange_rates). Par défaut USD */
  @IsOptional() @Transform(upper) @IsString() @MaxLength(10) currency?: string;
  @IsOptional() @IsIn(['day', 'week', 'month', 'year']) groupBy?: 'day' | 'week' | 'month' | 'year';
}

export class ForecastVsActualQueryDto extends CompanyQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2100) year?: number;
  @IsOptional() @Transform(upper) @IsString() @MaxLength(10) currency?: string;
}

export class ProjectionQueryDto extends CompanyQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(24) months?: number;
  @IsOptional() @Transform(upper) @IsString() @MaxLength(10) currency?: string;
}

export class LedgerQueryDto {
  @IsOptional() @Matches(DATE, DATE_MSG) from?: string;
  @IsOptional() @Matches(DATE, DATE_MSG) to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
}

// ============================================================
// ✅ CIRCUIT DE VALIDATION
// ============================================================

/** Un niveau : nom + validateurs (personnes et / ou rôles) */
export class CashApprovalLevelDto {
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(80) name: string;

  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsUUID('all', { each: true }) approverIds?: string[];

  /** OWNER : propriétaires de l'entreprise ; MANAGER : responsables financiers */
  @IsOptional() @IsArray() @IsIn(CASH_APPROVER_ROLES as unknown as string[], { each: true }) approverRoles?: string[];

  /** Validations nécessaires à ce niveau (1 par défaut) */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10) minApprovals?: number;

  /** Faire sonner les validateurs (appel) — oui par défaut */
  @IsOptional() @Transform(toBool) @IsBoolean() call?: boolean;

  /** Relance après N minutes sans réponse */
  @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(10080) reminderMinutes?: number;

  /** Prévenus si aucune réponse après les relances */
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsUUID('all', { each: true }) escalateToIds?: string[];
}

export class CreateCashApprovalRuleDto {
  @IsOptional() @IsUUID() companyId?: string;

  @Transform(trim) @IsString() @MinLength(2) @MaxLength(120) name: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) description?: string;

  /** OUT (sorties), IN (entrées), TRANSFER (transferts), ALL */
  @IsOptional() @IsEnum(CashApprovalScope) scope?: CashApprovalScope;

  /** À partir de ce montant (inclus) */
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) minAmount?: number;
  /** Jusqu'à ce montant (exclu) ; vide = sans limite */
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) maxAmount?: number | null;
  /** Devise des seuils (USD par défaut) */
  @IsOptional() @Transform(upper) @IsString() @MaxLength(10) currency?: string;

  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsUUID('all', { each: true }) categoryIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsUUID('all', { each: true }) accountIds?: string[];

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(6) @ValidateNested({ each: true }) @Type(() => CashApprovalLevelDto)
  levels: CashApprovalLevelDto[];

  @IsOptional() @Transform(toBool) @IsBoolean() applyToManagers?: boolean;
  @IsOptional() @Transform(toBool) @IsBoolean() allowSelfApproval?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1000) priority?: number;
  @IsOptional() @Transform(toBool) @IsBoolean() isActive?: boolean;
}

export class UpdateCashApprovalRuleDto {
  @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsEnum(CashApprovalScope) scope?: CashApprovalScope;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) minAmount?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) maxAmount?: number | null;
  @IsOptional() @Transform(upper) @IsString() @MaxLength(10) currency?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsUUID('all', { each: true }) categoryIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsUUID('all', { each: true }) accountIds?: string[];
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(6) @ValidateNested({ each: true }) @Type(() => CashApprovalLevelDto)
  levels?: CashApprovalLevelDto[];
  @IsOptional() @Transform(toBool) @IsBoolean() applyToManagers?: boolean;
  @IsOptional() @Transform(toBool) @IsBoolean() allowSelfApproval?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1000) priority?: number;
  @IsOptional() @Transform(toBool) @IsBoolean() isActive?: boolean;
}

/** Tester : quel circuit pour cette opération ? */
export class SimulateCashApprovalDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsEnum(CashApprovalScope) scope: CashApprovalScope;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount: number;
  @Transform(upper) @IsString() @MaxLength(10) currency: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsUUID() accountId?: string;
}

export class CashApprovalQueryDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsEnum(CashApprovalStatus) status?: CashApprovalStatus;
  @IsOptional() @IsEnum(CashApprovalTarget) targetType?: CashApprovalTarget;
  /** mine=requested : mes demandes ; mine=toApprove : à valider par moi ; mine=decided : où j'ai décidé */
  @IsOptional() @IsIn(['requested', 'toApprove', 'decided']) mine?: 'requested' | 'toApprove' | 'decided';
  @IsOptional() @IsUUID() requestedById?: string;
  @IsOptional() @Matches(DATE, DATE_MSG) from?: string;
  @IsOptional() @Matches(DATE, DATE_MSG) to?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

export class CashApprovalDecisionDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) comment?: string;
}

export class CashApprovalRejectDto {
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(500) reason: string;
}

export class CashApprovalCommentDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(1000) comment: string;
}

export class BulkCashApprovalDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsUUID('all', { each: true }) ids: string[];
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) comment?: string;
}
