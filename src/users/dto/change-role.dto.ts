import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { UserRole } from '../enum/user-role-enum';

export class ChangeUserRoleDto {
  @IsEnum(UserRole, {
    message: 'Le rôle doit être une valeur valide (CUSTOMER, ADMIN, DELIVER, SUPER ADMIN, DRIVER).',
  })
  @IsNotEmpty()
  role: UserRole;

  @IsOptional()
  @IsString()
  reason?: string;
}