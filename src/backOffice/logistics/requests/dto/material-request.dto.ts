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
import { MaterialRequestPriority, MaterialRequestStatus } from '../../common/logistics.enums';

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

// ============================================================
// DEMANDE (employé)
// ============================================================
export class MaterialRequestItemDto {
  /** Bien précis (facultatif) */
  @IsOptional() @IsUUID() assetId?: string;
  /** Catégorie (facultatif) — ex. « Chaises » */
  @IsOptional() @IsUUID() categoryId?: string;
  /** Ce qui est demandé (obligatoire si ni bien ni catégorie) */
  @IsOptional() @IsString() @MaxLength(255) description?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(100000) quantity: number;
}

export class CreateMaterialRequestDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsString() @MinLength(3) @MaxLength(500) reason: string;
  @IsOptional() @IsEnum(MaterialRequestPriority) priority?: MaterialRequestPriority;
  @IsOptional() @IsDateString() neededBy?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @Transform(toJsonArrayOf(MaterialRequestItemDto)) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true })
  items: MaterialRequestItemDto[];
  @IsOptional() @IsString() @MaxLength(500) photoUrl?: string;
}

// ============================================================
// VALIDATION (logisticien)
// ============================================================
export class ApproveItemDto {
  @IsUUID() itemId: string;
  /** 0 = refusé pour cette ligne */
  @Type(() => Number) @IsInt() @Min(0) quantityApproved: number;
}

export class ApproveMaterialRequestDto {
  /** Lignes non citées : accordées à la quantité demandée */
  @IsOptional() @Transform(toJsonArrayOf(ApproveItemDto)) @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true })
  items?: ApproveItemDto[];
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class RejectMaterialRequestDto {
  @IsString() @MinLength(3) @MaxLength(500) note: string;
}

// ============================================================
// SORTIE (logisticien) → remises à l'employé + bon de sortie
// ============================================================
export class IssueLineDto {
  @IsUUID() itemId: string;
  /** Bien du stock à remettre (obligatoire si la ligne n'indique pas de bien précis) */
  @IsOptional() @IsUUID() assetId?: string;
  @Type(() => Number) @IsInt() @Min(1) quantity: number;
}

export class IssueMaterialRequestDto {
  @Transform(toJsonArrayOf(IssueLineDto)) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true })
  lines: IssueLineDto[];
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsOptional() @IsString() @MaxLength(500) photoUrl?: string;
}

export class MaterialRequestQueryDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsEnum(MaterialRequestStatus) status?: MaterialRequestStatus;
  @IsOptional() @IsUUID() requesterId?: string;
  /** true : seulement mes demandes */
  @IsOptional() @IsString() mine?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
}

export class AddLogisticsManagerDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsUUID() userId: string;
}
