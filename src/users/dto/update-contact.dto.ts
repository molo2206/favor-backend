import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';


/** PATCH users/me/email — modifier uniquement l'email */
export class UpdateEmailDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(255)
  email: string;

  /**
   * ✅ Code PIN reçu sur la NOUVELLE adresse email.
   * 1er appel sans otpCode → le code est envoyé ; 2e appel avec otpCode → l'email est modifié.
   */
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null ? value : String(value).trim()))
  @Matches(/^[0-9]{4,6}$/)
  otpCode?: string;

  /** ⚠️ Ignoré (ancienne version des applications) : la confirmation se fait par code PIN */
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

  /**
   * ✅ Code PIN reçu par SMS sur le NOUVEAU numéro.
   * 1er appel sans otpCode → le code est envoyé ; 2e appel avec otpCode → le numéro est modifié.
   */
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null ? value : String(value).trim()))
  @Matches(/^[0-9]{4,6}$/)
  otpCode?: string;

  /** ⚠️ Ignoré (ancienne version des applications) : la confirmation se fait par code PIN */
  @IsOptional()
  @IsString()
  password?: string;
}
