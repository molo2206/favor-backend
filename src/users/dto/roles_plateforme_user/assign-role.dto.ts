import { IsUUID } from 'class-validator';

export class AssignRoleDto {
  @IsUUID()
  userId: string;

  @IsUUID()
  platformId: string;

  @IsUUID()
  roleId: string;
}
