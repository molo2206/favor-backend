import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { UserRole } from '../enum/user-role-enum';
import { Exclude } from 'class-transformer';

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

  @Exclude()
  @IsNotEmpty({ message: 'Le mot de passe est requis.' })
  @Length(6, 20, {
    message: 'Le mot de passe doit contenir entre 6 et 20 caractères.',
  })
  password: string;

  @IsOptional()
  @IsString()
  country: string;

  @IsOptional()
  @IsString()
  city: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  otpCode?: string;

  @IsOptional() @IsEnum(UserRole, { each: true }) roles?: UserRole;
}
