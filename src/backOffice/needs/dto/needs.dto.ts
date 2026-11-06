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
  NEED_APPROVER_ROLES,
  NEED_ATTACHMENT_KINDS,
  NEED_PAYMENT_METHODS,
  NeedExecutionStatus,
  NeedFinanceStatus,
  NeedMemberRole,
  NeedPriority,
  NeedStatus,
} from '../common/needs.enums';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MSG = { message: 'Date attendue au format AAAA-MM-JJ' };
const trim = ({ value }: { value: any }) => (typeof value === 'string' ? value.trim() : value);
const upper = ({ value }: { value: any }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);
/** multipart/form-data : "12.5" → 12.5 ; "" → absent */
const toNum = ({ value }: { value: any }) => (value === '' || value === null || value === undefined ? undefined : Number(value));
const toBool = ({ value }: { value: any }) =>
  value === undefined || value === null || value === '' ? undefined : value === true || value === 'true' || value === '1';

export class CompanyQueryDto {
  /** Facultatif : entreprise active de l'utilisateur par défaut */
  @IsOptional() @IsUUID() companyId?: string;
}

// ============================================================
// ÉTAT DE BESOIN (agent)
// ============================================================

export class NeedItemDto {
  /** Pour modifier une ligne existante (sinon nouvelle ligne) */
  @IsOptional() @IsUUID() id?: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(255) designation: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(30) unit?: string;
  @Transform(toNum) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) quantity: number;
  @Transform(toNum) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) unitPrice: number;
}

export class CreateNeedDto {
  @IsOptional() @IsUUID() companyId?: string;
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(200) title: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(5000) description?: string;
  /** MATERIAL, SUPPLIES, LOGISTICS, TRANSPORT, MAINTENANCE, COMMUNICATION, IT, SERVICES, TRAINING, OTHER (ou autre code) */
  @Transform(upper) @IsString() @MinLength(2) @MaxLength(40) category: string;
  @IsOptional() @IsEnum(NeedPriority) priority?: NeedPriority;
  /** Motif et justification (obligatoire à la soumission) */
  @IsOptional() @Transform(trim) @IsString() @MaxLength(5000) justification?: string;
  @IsOptional() @Matches(DATE, DATE_MSG) neededBy?: string;
  /** Devise des prix (USD par défaut) */
  @IsOptional() @Transform(upper) @IsString() @MaxLength(10) currency?: string;
  /** Département (par défaut : celui de la fiche employé RH du demandeur) */
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => NeedItemDto) items?: NeedItemDto[];
  /** Soumettre directement (sinon brouillon) */
  @IsOptional() @Transform(toBool) @IsBoolean() submit?: boolean;
}

export class UpdateNeedDto {
  /** Version lue (protection contre deux modifications simultanées) */
  @IsOptional() @Type(() => Number) @IsInt() version?: number;
  @IsOptional() @Transform(trim) @IsString() @MinLength(3) @MaxLength(200) title?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @Transform(upper) @IsString() @MinLength(2) @MaxLength(40) category?: string;
  @IsOptional() @IsEnum(NeedPriority) priority?: NeedPriority;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(5000) justification?: string;
  @IsOptional() @Matches(DATE, DATE_MSG) neededBy?: string | null;
  @IsOptional() @Transform(upper) @IsString() @MaxLength(10) currency?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  /** Remplace TOUTE la liste des articles */
  @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => NeedItemDto) items?: NeedItemDto[];
}

export class SubmitNeedDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) comment?: string;
}

export class CancelNeedDto {
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(500) reason: string;
}

export class AttachmentUploadDto {
  /** QUOTE (devis), JUSTIFICATION, PAYMENT_PROOF, EXECUTION_PROOF, OTHER */
  @IsOptional() @Transform(upper) @IsIn(NEED_ATTACHMENT_KINDS as unknown as string[]) kind?: string;
}

// ============================================================
// VALIDATION (validateurs)
// ============================================================

export class NeedApproveDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) comment?: string;
  /** Montant approuvé (≤ montant demandé) ; vide = montant demandé */
  @IsOptional() @Transform(toNum) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) approvedAmount?: number;
  /** Administrateur : décider à la place du niveau en cours (hors tour) */
  @IsOptional() @Transform(toBool) @IsBoolean() override?: boolean;
}

export class NeedRejectDto {
  /** Motif obligatoire */
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(1000) reason: string;
  @IsOptional() @Transform(toBool) @IsBoolean() override?: boolean;
}

export class NeedCorrectionDto {
  /** Corrections / informations demandées (obligatoire) */
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(1000) message: string;
  @IsOptional() @Transform(toBool) @IsBoolean() override?: boolean;
}

export class NeedCommentDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(2000) comment: string;
}

export class NeedBulkApproveDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @IsUUID('all', { each: true }) ids: string[];
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) comment?: string;
}

// ============================================================
// FINANCE / EXÉCUTION
// ============================================================

export class NeedTransmitDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) note?: string;
}

export class NeedAuthorizeDto {
  /** Montant autorisé au décaissement (≤ montant approuvé) */
  @Transform(toNum) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount: number;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) note?: string;
}

export class NeedDisburseDto {
  @Transform(toNum) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount: number;
  /** Date du décaissement (aujourd'hui par défaut) */
  @IsOptional() @Matches(DATE, DATE_MSG) paidAt?: string;
  /** Personne qui a payé (par défaut : celui qui enregistre) */
  @IsOptional() @IsUUID() paidById?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(150) beneficiary?: string;
  @IsOptional() @Transform(upper) @IsIn(NEED_PAYMENT_METHODS as unknown as string[]) paymentMethod?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) paymentReference?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) note?: string;
  /** Compte de trésorerie : la sortie de caisse est aussi enregistrée dans le module Trésorerie */
  @IsOptional() @IsUUID() cashAccountId?: string;
  @IsOptional() @IsUUID() cashCategoryId?: string;
}

export class NeedExecutionItemDto {
  @IsUUID() itemId: string;
  @Transform(toNum) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) executedQuantity: number;
}

export class NeedExecutionDto {
  /** IN_PROGRESS, PARTIAL (partiellement exécuté), COMPLETED (totalement exécuté) */
  @IsOptional() @IsIn([NeedExecutionStatus.IN_PROGRESS, NeedExecutionStatus.PARTIAL, NeedExecutionStatus.COMPLETED]) status?: NeedExecutionStatus;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) note?: string;
  /** Quantités exécutées par article : le statut est déduit si `status` est absent */
  @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => NeedExecutionItemDto) items?: NeedExecutionItemDto[];
}

// ============================================================
// LISTES / TABLEAU DE BORD / EXPORTS
// ============================================================

export class NeedQueryDto extends CompanyQueryDto {
  /**
   * mine : mes demandes ; inbox : à valider par moi maintenant ; validated_by_me : où je suis intervenu ;
   * finance : file du service financier ; all : toutes (administrateur, finance, lecteur)
   */
  @IsOptional() @IsIn(['mine', 'inbox', 'validated_by_me', 'finance', 'all']) scope?: string;
  @IsOptional() @IsEnum(NeedStatus) status?: NeedStatus;
  @IsOptional() @IsEnum(NeedFinanceStatus) financeStatus?: NeedFinanceStatus;
  @IsOptional() @IsEnum(NeedExecutionStatus) executionStatus?: NeedExecutionStatus;
  @IsOptional() @IsEnum(NeedPriority) priority?: NeedPriority;
  @IsOptional() @Transform(upper) @IsString() @MaxLength(40) category?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() requesterId?: string;
  /** Demandes où cette personne est validateur */
  @IsOptional() @IsUUID() validatorId?: string;
  /** Période (date de soumission, sinon de création) */
  @IsOptional() @Matches(DATE, DATE_MSG) from?: string;
  @IsOptional() @Matches(DATE, DATE_MSG) to?: string;
  @IsOptional() @Transform(upper) @IsString() @MaxLength(10) currency?: string;
  /** Référence, titre, demandeur */
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) search?: string;
  /** Demandes en attente depuis plus longtemps que le délai prévu */
  @IsOptional() @IsIn(['true', 'false']) overdue?: 'true' | 'false';
  @IsOptional() @IsIn(['createdAt', 'submittedAt', 'estimatedTotal', 'priority']) sortBy?: string;
  @IsOptional() @IsIn(['ASC', 'DESC']) sortOrder?: 'ASC' | 'DESC';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

export class NeedExportQueryDto extends NeedQueryDto {
  @IsOptional() @IsIn(['xlsx', 'pdf']) format?: 'xlsx' | 'pdf';
}

// ============================================================
// CONFIGURATION (administrateur)
// ============================================================

export class NeedLevelDto {
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(80) name: string;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsUUID('all', { each: true }) approverIds?: string[];
  /** DEPARTMENT_MANAGER, PARENT_DEPARTMENT_MANAGER, FINANCE, OWNER, NEED_ADMIN */
  @IsOptional() @IsArray() @IsIn(NEED_APPROVER_ROLES as unknown as string[], { each: true }) approverRoles?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsUUID('all', { each: true }) substituteIds?: string[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10) minApprovals?: number;
  /** Niveau ajouté seulement à partir de ce montant (devise de la règle) */
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) minAmount?: number | null;
  @IsOptional() @Transform(toBool) @IsBoolean() call?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(20160) reminderMinutes?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(20) maxReminders?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsUUID('all', { each: true }) escalateToIds?: string[];
}

export class CreateNeedRuleDto {
  @IsOptional() @IsUUID() companyId?: string;
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(120) name: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true }) departmentIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) categories?: string[];
  @IsOptional() @IsArray() @IsEnum(NeedPriority, { each: true }) priorities?: NeedPriority[];
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) minAmount?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) maxAmount?: number | null;
  @IsOptional() @Transform(upper) @IsString() @MaxLength(10) currency?: string;
  /** Niveaux, dans l'ordre (pas de limite à 4 : jusqu'à 20) */
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => NeedLevelDto) levels: NeedLevelDto[];
  @IsOptional() @Transform(toBool) @IsBoolean() allowSelfApproval?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(2160) slaHours?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1000) priority?: number;
  @IsOptional() @Transform(toBool) @IsBoolean() isActive?: boolean;
}

export class UpdateNeedRuleDto {
  @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true }) departmentIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) categories?: string[];
  @IsOptional() @IsArray() @IsEnum(NeedPriority, { each: true }) priorities?: NeedPriority[];
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) minAmount?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) maxAmount?: number | null;
  @IsOptional() @Transform(upper) @IsString() @MaxLength(10) currency?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => NeedLevelDto) levels?: NeedLevelDto[];
  @IsOptional() @Transform(toBool) @IsBoolean() allowSelfApproval?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(2160) slaHours?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1000) priority?: number;
  @IsOptional() @Transform(toBool) @IsBoolean() isActive?: boolean;
}

export class SimulateNeedCircuitDto {
  @IsOptional() @IsUUID() companyId?: string;
  @Transform(toNum) @IsNumber() @Min(0) amount: number;
  @IsOptional() @Transform(upper) @IsString() @MaxLength(10) currency?: string;
  @IsOptional() @Transform(upper) @IsString() @MaxLength(40) category?: string;
  @IsOptional() @IsEnum(NeedPriority) priority?: NeedPriority;
  @IsOptional() @IsUUID() departmentId?: string;
  /** Demandeur simulé (par défaut : moi) */
  @IsOptional() @IsUUID() requesterId?: string;
}

export class UpsertNeedMemberDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsUUID() userId: string;
  /** ADMIN, FINANCE, VIEWER ; null = aucun rôle (indisponibilité seulement) */
  @IsOptional() @IsIn([...Object.values(NeedMemberRole), null]) role?: NeedMemberRole | null;
}

/** ✅ Indisponibilité d'un validateur (lui-même ou l'administrateur) */
export class NeedAvailabilityDto {
  @IsOptional() @IsUUID() companyId?: string;
  /** Administrateur : pour quelqu'un d'autre */
  @IsOptional() @IsUUID() userId?: string;
  /** Vide : de nouveau disponible */
  @IsOptional() @Matches(DATE, DATE_MSG) from?: string | null;
  @IsOptional() @Matches(DATE, DATE_MSG) until?: string | null;
  /** Remplaçant pendant l'absence */
  @IsOptional() @IsUUID() delegateId?: string | null;
}
