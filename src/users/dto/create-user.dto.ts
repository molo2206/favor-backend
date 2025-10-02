import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  IsPhoneNumber,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { UserRole } from '../enum/user-role-enum';

export class CreateUserDto {
  @IsNotEmpty({ message: 'Le nom complet est requis.' })
  @IsString({ message: 'Le nom complet doit être une chaîne de caractères.' })
  fullName: string;

  @Transform(({ value }) => value.toLowerCase())
  @IsNotEmpty({ message: "L'email est requis." })
  @IsEmail({}, { message: 'Email invalide.' })
  email: string;

  @IsOptional()
  @IsPhoneNumber(undefined, { message: 'Le numéro de téléphone est invalide.' })
  phone?: string;

  @IsNotEmpty({ message: 'Le mot de passe est requis.' })
  @IsString({ message: 'Le mot de passe doit être une chaîne de caractères.' })
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

  @IsOptional()
  @IsString()
  otpCode?: string;

  @IsOptional()
  @IsEnum(UserRole)
  @Transform(({ value }) => (value ? value : UserRole.CUSTOMER))
  roles?: UserRole = UserRole.CUSTOMER;
}
