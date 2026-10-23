import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';


/** PATCH users/me/email — modifier uniquement l'email */
export class UpdateEmailDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(255)
  email: string;

  /** Mot de passe actuel (obligatoire sauf comptes Google / Apple) */
  @IsOptional()
  @IsString()
  password?: string;
}

/** PATCH users/me/phone — modifier uniquement le téléphone */
export class UpdatePhoneDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().replace(/[\s\-().]/g, '') : value))
  @IsNotEmpty()
  @Matches(/^\+?[0-9]{8,15}$/)
  phone: string;

  /** Mot de passe actuel (obligatoire sauf comptes Google / Apple) */
  @IsOptional()
  @IsString()
  password?: string;
}
