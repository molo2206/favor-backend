import { IsString, Matches, IsEnum, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { UserRole } from '../enum/user-role-enum';

export class CreateUserDto {
  @IsString({ message: 'Le nom complet doit être une chaîne de caractères.' })
  fullName: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value === null) return undefined;
    return value?.trim();
  })
  email?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value === null) return undefined;
    return value?.trim();
  })
  phone?: string;

  @IsString()
  @Matches(/(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])/, {
    message: 'Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre.',
  })
  password?: string;

  @IsOptional()
  @IsString()
  otpCode?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsEnum(UserRole)
  roles?: UserRole = UserRole.CUSTOMER;

  @IsOptional()
  @IsString()
  fcmToken?: string;

  @IsOptional()
  @IsString()
  platform?: 'ios' | 'android' | 'web';
}