import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { UserRole } from '../enum/user-role-enum';

export class CreateUserDto {
  @IsNotEmpty({ message: 'Le nom complet est requis.' })
  @IsString({ message: 'Le nom complet doit être une chaîne de caractères.' })
  fullName: string;

  @IsNotEmpty({ message: "L'email est requis." })
  @IsEmail({}, { message: 'Email invalide.' })
  email: string;

  @IsNotEmpty({ message: 'Le numéro de téléphone est requis.' })
  @IsString({ message: 'Le numéro de téléphone doit être une chaîne de caractères.' })
  phone: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])/, {
    message:
      'Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre.',
  })
  password: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  address?: string;

  // ✅ otpCode est optionnel, mais si fourni il doit être string et ≥ 6
  @IsOptional()
  @ValidateIf((o) => o.otpCode !== undefined && o.otpCode !== null && o.otpCode !== '')
  @IsString({ message: 'OTP doit être une chaîne de caractères.' })
  @MinLength(6, { message: 'OTP doit contenir au moins 6 caractères.' })
  otpCode?: string;

  @IsOptional()
  @IsEnum(UserRole)
  roles?: UserRole;
}
