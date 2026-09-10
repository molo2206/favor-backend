// DTO pour la requête
export class SetUserCompanyPermissionsDto {
  companyId: string;
  userId: string;
  branchId?: string;

  permissions: {
    resourceId: string;
    canRead?: boolean;
    canCreate?: boolean;
    canUpdate?: boolean;
    canDelete?: boolean;
    canManage?: boolean;
    status?: boolean;
  }[];
}

// DTO pour la réponse
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
}