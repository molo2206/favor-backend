import { IsUUID, IsArray, ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { ResourcePermissionDto } from './create-company-admin.dto';

export class UpdateUserCompanyPermissionsDto {
  @IsUUID()
  userHasCompanyId!: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ResourcePermissionDto)
  resources!: ResourcePermissionDto[];
}
