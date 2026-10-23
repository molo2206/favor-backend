import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
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
} from 'class-validator';
import { AssetCondition, AssetDisposalReason, AssetMovementType, AssetStatus } from '../../common/logistics.enums';

// ============================================================
// CATÉGORIES
// ============================================================
export class CreateAssetCategoryDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsString() @MinLength(2) @MaxLength(120) name: string;
  @IsOptional() @IsString() @MaxLength(10) code?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) depreciationYears?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateAssetCategoryDto extends PartialType(CreateAssetCategoryDto) { }

// ============================================================
// BIENS
// ============================================================
export class CreateAssetDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsString() @MinLength(2) @MaxLength(150) name: string;
  /** Code d'inventaire ; généré automatiquement s'il est absent */
  @IsOptional() @IsString() @MaxLength(40) reference?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsString() @MaxLength(80) brand?: string;
  @IsOptional() @IsString() @MaxLength(80) model?: string;
  @IsOptional() @IsString() @MaxLength(100) serialNumber?: string;
  @IsOptional() @IsString() @MaxLength(100) barcode?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) quantity?: number;
  @IsOptional() @IsEnum(AssetCondition) condition?: AssetCondition;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsString() @MaxLength(150) location?: string;
  /** Affecter tout de suite à un employé */
  @IsOptional() @IsUUID() assignedToUserId?: string;
  @IsOptional() @IsDateString() acquisitionDate?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) acquisitionCost?: number;
  @IsOptional() @IsString() @MaxLength(10) currency?: string;
  @IsOptional() @IsString() @MaxLength(150) supplier?: string;
  @IsOptional() @IsString() @MaxLength(100) invoiceNumber?: string;
  @IsOptional() @IsDateString() warrantyEndDate?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) depreciationYears?: number;
  @IsOptional() @IsString() @MaxLength(500) photoUrl?: string;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
}

/** Modification des informations (les changements de situation passent par les actions dédiées) */
export class UpdateAssetDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(150) name?: string;
  @IsOptional() @IsString() @MaxLength(40) reference?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsString() @MaxLength(80) brand?: string;
  @IsOptional() @IsString() @MaxLength(80) model?: string;
  @IsOptional() @IsString() @MaxLength(100) serialNumber?: string;
  @IsOptional() @IsString() @MaxLength(100) barcode?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) quantity?: number;
  @IsOptional() @IsString() @MaxLength(150) location?: string;
  @IsOptional() @IsDateString() acquisitionDate?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) acquisitionCost?: number;
  @IsOptional() @IsString() @MaxLength(10) currency?: string;
  @IsOptional() @IsString() @MaxLength(150) supplier?: string;
  @IsOptional() @IsString() @MaxLength(100) invoiceNumber?: string;
  @IsOptional() @IsDateString() warrantyEndDate?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) depreciationYears?: number;
  @IsOptional() @IsString() @MaxLength(500) photoUrl?: string;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
}

export class AssignAssetDto {
  @IsUUID() userId: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsString() @MaxLength(150) location?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class ReturnAssetDto {
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsString() @MaxLength(150) location?: string;
  @IsOptional() @IsEnum(AssetCondition) condition?: AssetCondition;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class TransferAssetDto {
  @IsUUID() toBranchId: string;
  @IsOptional() @IsString() @MaxLength(150) location?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class RepairAssetDto {
  /** SEND = envoi en réparation, RETURN = retour de réparation */
  @IsEnum(['SEND', 'RETURN'] as const) action: 'SEND' | 'RETURN';
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) cost?: number;
  @IsOptional() @IsEnum(AssetCondition) condition?: AssetCondition;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class ConditionAssetDto {
  @IsEnum(AssetCondition) condition: AssetCondition;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class CheckAssetDto {
  @IsOptional() @IsEnum(AssetCondition) condition?: AssetCondition;
  @IsOptional() @IsString() @MaxLength(150) location?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) countedQuantity?: number;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class AssetNoteDto {
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class DisposeAssetDto {
  @IsEnum(AssetDisposalReason) reason: AssetDisposalReason;
  @IsOptional() @IsDateString() disposalDate?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) disposalValue?: number;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class AssetQueryDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsEnum(AssetStatus) status?: AssetStatus;
  @IsOptional() @IsEnum(AssetCondition) condition?: AssetCondition;
  @IsOptional() @IsUUID() assignedToUserId?: string;
  /** true : biens dont la garantie expire dans 30 jours */
  @IsOptional() @IsString() warrantyExpiring?: string;
  /** Inclure les biens sortis du patrimoine */
  @IsOptional() @IsString() includeDisposed?: string;
  /** Nom, code, n° de série, code-barres, marque, modèle */
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
}

export class AssetMovementQueryDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsUUID() assetId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @IsEnum(AssetMovementType) type?: AssetMovementType;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
}
