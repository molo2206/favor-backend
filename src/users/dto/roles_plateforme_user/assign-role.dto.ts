import { IsArray, IsOptional, IsUUID, IsString } from 'class-validator';

class PlatformRoleDto {
  @IsUUID()
  platformId: string;

  @IsUUID()
  roleId: string;
}

export class AssignRoleDto {
  @IsUUID()
  userId: string;

  @IsString()
  role: string; 

  @IsOptional()
  @IsArray()
  platforms?: PlatformRoleDto[];
}
