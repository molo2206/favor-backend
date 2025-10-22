import { IsNotEmpty, IsOptional, IsString, Matches, IsEnum, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';
import { UserRole } from '../enum/user-role-enum';
import { IsEmailOrPhone } from '../utility/helpers/IsEmailOrPhone';

export class CreateUserDto {
  @IsNotEmpty({ message: 'Le nom complet est requis.' })
  @IsString({ message: 'Le nom complet doit être une chaîne de caractères.' })
  fullName: string;

  // Email optionnel
  @ValidateIf((o) => o.email)
  @IsString()
  @IsEmailOrPhone({ message: 'Doit être un email ou un numéro de téléphone valide.' })
  email?: string;

  // Phone optionnel
  @ValidateIf((o) => o.phone)
  @IsString()
  @IsEmailOrPhone({ message: 'Doit être un email ou un numéro de téléphone valide.' })
  phone?: string;

  // Champ virtuel pour validation globale (au moins un requis)
  @IsNotEmpty({ message: 'Un email ou un numéro de téléphone est requis.' })
  validateEmailOrPhone?: string;

  @IsOptional()
  @IsString({ message: 'Le mot de passe doit être une chaîne de caractères.' })
  @Matches(/(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])/, {
    message:
      'Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre.',
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

  @IsOptional()
  @IsEnum(UserRole)
  @Transform(({ value }) => (value ? value : UserRole.CUSTOMER))
  roles?: UserRole = UserRole.CUSTOMER;

  @IsOptional()
  @IsString()
  fcmToken?: string;

  @IsOptional()
  @IsString()
  platform?: 'ios' | 'android' | 'web';
}
