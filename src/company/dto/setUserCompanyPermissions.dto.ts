import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { BranchEntity } from 'src/branch/entity/branch.entity';

// ============================================================
// Permission envoyée pour une ressource
// ============================================================
export class CompanyPermissionItemDto {
  @IsUUID()
  @IsNotEmpty()
  resourceId: string;

  @IsOptional()
  @IsBoolean()
  canRead?: boolean;

  @IsOptional()
  @IsBoolean()
  canCreate?: boolean;

  @IsOptional()
  @IsBoolean()
  canUpdate?: boolean;

  @IsOptional()
  @IsBoolean()
  canDelete?: boolean;

  @IsOptional()
  @IsBoolean()
  canManage?: boolean;

  @IsOptional()
  @IsBoolean()
  status?: boolean;
}

// ============================================================
// DTO pour la requête
// ============================================================
export class SetUserCompanyPermissionsDto {
  @IsUUID()
  @IsNotEmpty()
  companyId: string;

  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsUUID()
  branchId?: string;

  /**
   * Optionnel :
   *  - première affectation sans permissions → permissions par défaut de l'entreprise
   *  - affectation existante sans aucune permission → permissions par défaut
   *  - affectation existante avec permissions et liste vide → permissions conservées
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompanyPermissionItemDto)
  permissions?: CompanyPermissionItemDto[];
}

// ============================================================
// DTO pour la réponse
// ============================================================
export class PermissionResponseDto {
  resourceId: string;
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canManage: boolean;
  status: boolean;
}

export class SetUserCompanyPermissionsResponseDto {
  userId: string;
  companyId: string;
  branchId: string;
  branchName: string;
  permissionsCount: number;
  permissions: PermissionResponseDto[];

  /** true = l'utilisateur était déjà affecté à l'entreprise */
  wasAlreadyAssigned: boolean;
  /** true = aucune permission envoyée → permissions par défaut de l'entreprise appliquées */
  defaultPermissionsApplied: boolean;
  /** true = aucune permission envoyée et permissions existantes conservées */
  permissionsKept: boolean;
  /** Ressources demandées mais non attribuées (inexistantes ou non autorisées pour l'entreprise) */
  ignoredResourceIds: string[];
}

// ============================================================
// Types internes du moteur d'affectation (CompanyService)
// ============================================================
export interface AssignmentPermission {
  resourceId: string;
  canRead?: boolean;
  canCreate?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
  canManage?: boolean;
  status?: boolean;
}

export interface AssignmentResult {
  userCompanyId: string;
  branch: BranchEntity;
  wasAlreadyAssigned: boolean;
  defaultPermissionsApplied: boolean;
  permissionsKept: boolean;
  ignoredResourceIds: string[];
  permissions: PermissionResponseDto[];
}
