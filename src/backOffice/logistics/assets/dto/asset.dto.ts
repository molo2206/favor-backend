import { PartialType } from '@nestjs/mapped-types';
import { plainToInstance, Transform, Type } from 'class-transformer';
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
import { AssetCondition, AssetDisposalReason, AssetMovementType, AssetStatus } from '../../common/logistics.enums';
import { toBool } from '../../common/logistics-access';

/** multipart/form-data : tableau envoyé en texte JSON → tableau d'objets typés */
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

/**
 * ✅ Images : chaque création / action accepte un fichier multipart `image`
 * (ou `photoUrl` si l'image est déjà en ligne).
 */

// ============================================================
// CATÉGORIES
// ============================================================
export class CreateAssetCategoryDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsString() @MinLength(2) @MaxLength(120) name: string;
  @IsOptional() @IsString() @MaxLength(10) code?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) depreciationYears?: number;
  @IsOptional() @Transform(toBool) @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() @MaxLength(500) photoUrl?: string;
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
  /** Nombre d'unités entrées (lot) */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) quantity?: number;
  /** Unité de comptage : pièce, carton, rame, litre… */
  @IsOptional() @IsString() @MaxLength(20) unit?: string;
  @IsOptional() @IsEnum(AssetCondition) condition?: AssetCondition;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsString() @MaxLength(150) location?: string;
  /** Affecter tout de suite à un employé (toute la quantité) */
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
  /** ⚠️ Pour ajouter du stock, utiliser l'entrée (POST assets/:id/stock-in) */
  @IsOptional() @IsString() @MaxLength(20) unit?: string;
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
  /** ✅ Quantité remise (défaut : tout le stock disponible) */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) quantity?: number;
  @IsOptional() @IsString() @MaxLength(500) photoUrl?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsString() @MaxLength(150) location?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class ReturnAssetDto {
  /** Employé qui rend (obligatoire si plusieurs employés ont une partie du bien) */
  @IsOptional() @IsUUID() userId?: string;
  /** Ou la remise précise */
  @IsOptional() @IsUUID() assignmentId?: string;
  /** ✅ Quantité rendue (défaut : tout ce que l'employé détient) */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) quantity?: number;
  @IsOptional() @IsString() @MaxLength(500) photoUrl?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsString() @MaxLength(150) location?: string;
  @IsOptional() @IsEnum(AssetCondition) condition?: AssetCondition;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class TransferAssetDto {
  @IsUUID() toBranchId: string;
  @IsOptional() @IsString() @MaxLength(500) photoUrl?: string;
  @IsOptional() @IsString() @MaxLength(150) location?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class RepairAssetDto {
  /** SEND = envoi en réparation, RETURN = retour de réparation */
  @IsEnum(['SEND', 'RETURN'] as const) action: 'SEND' | 'RETURN';
  @IsOptional() @IsString() @MaxLength(500) photoUrl?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) cost?: number;
  @IsOptional() @IsEnum(AssetCondition) condition?: AssetCondition;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class ConditionAssetDto {
  @IsEnum(AssetCondition) condition: AssetCondition;
  @IsOptional() @IsString() @MaxLength(500) photoUrl?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class CheckAssetDto {
  @IsOptional() @IsEnum(AssetCondition) condition?: AssetCondition;
  @IsOptional() @IsString() @MaxLength(150) location?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) countedQuantity?: number;
  @IsOptional() @IsString() @MaxLength(500) photoUrl?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class AssetNoteDto {
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsOptional() @IsString() @MaxLength(500) photoUrl?: string;
}

/** ✅ Perte d'une partie du stock (défaut : tout le bien) */
export class LostAssetDto extends AssetNoteDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) quantity?: number;
}

/** ✅ Entrée de stock : nouvelles unités d'un bien existant (réapprovisionnement) */
export class StockInDto {
  @Type(() => Number) @IsInt() @Min(1) quantity: number;
  /** Coût unitaire (ajouté à la valeur d'achat) */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) unitCost?: number;
  @IsOptional() @IsString() @MaxLength(150) supplier?: string;
  @IsOptional() @IsString() @MaxLength(100) invoiceNumber?: string;
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsOptional() @IsString() @MaxLength(500) photoUrl?: string;
}

/** ✅ Sortie groupée : plusieurs biens (et quantités) remis à un employé en une fois → bon de sortie */
export class BulkAssignLineDto {
  @IsUUID() assetId: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) quantity?: number;
}

export class BulkAssignDto {
  @IsUUID() userId: string;
  @Transform(toJsonArrayOf(BulkAssignLineDto)) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true })
  lines: BulkAssignLineDto[];
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsOptional() @IsString() @MaxLength(500) photoUrl?: string;
}

/** ✅ Restitution groupée */
export class BulkReturnLineDto {
  @IsUUID() assignmentId: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) quantity?: number;
  @IsOptional() @IsEnum(AssetCondition) condition?: AssetCondition;
}

export class BulkReturnDto {
  @Transform(toJsonArrayOf(BulkReturnLineDto)) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true })
  lines: BulkReturnLineDto[];
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsOptional() @IsString() @MaxLength(500) photoUrl?: string;
}

export class AssignmentQueryDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @IsUUID() assetId?: string;
  /** true : seulement les remises en cours */
  @IsOptional() @IsString() active?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
}

export class DisposeAssetDto {
  @IsEnum(AssetDisposalReason) reason: AssetDisposalReason;
  @IsOptional() @IsDateString() disposalDate?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) disposalValue?: number;
  /** ✅ Quantité sortie du patrimoine (défaut : tout le bien) */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) quantity?: number;
  @IsOptional() @IsString() @MaxLength(500) photoUrl?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class AssetQueryDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsEnum(AssetStatus) status?: AssetStatus;
  @IsOptional() @IsEnum(AssetCondition) condition?: AssetCondition;
  @IsOptional() @IsUUID() assignedToUserId?: string;
  /** ✅ true : seulement les biens dont il reste du stock */
  @IsOptional() @IsString() inStock?: string;
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
