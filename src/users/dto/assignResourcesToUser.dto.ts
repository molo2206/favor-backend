import { IsUUID, IsArray, ValidateNested, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

class ResourceDto {
  @IsUUID()
  resourceId: string;

  @IsBoolean()
  create: boolean;

  @IsBoolean()
  update: boolean;

  @IsBoolean()
  read: boolean;

  @IsBoolean()
  delete: boolean;

  @IsBoolean()
  validate: boolean;
}

export class AssignResourcesDto {
  @IsUUID()
  userId: string;

  @IsUUID()
  platformId: string;

  @IsUUID()
  roleId: string;

  @IsUUID()
  branchId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ResourceDto)
  resources: ResourceDto[];
}
