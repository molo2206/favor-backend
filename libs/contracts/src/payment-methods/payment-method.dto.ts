import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
/** Modes de paiement qu'un utilisateur peut enregistrer (mêmes valeurs que l'application actuelle) */
export enum UserPaymentMethodType {
  MOBILE_MONEY = 'MOBILE_MONEY',
  FPAY = 'FPAY',
  CASH = 'CASH',
}

const ACCEPTED_CURRENCIES = ['USD', 'CDF', 'XAF', 'XOF'];

/** Numéro : chiffres uniquement, sans + ni espaces (243970000000) */
const cleanPhone = ({ value }: { value: any }) =>
  typeof value === 'string' ? value.replace(/[\s\-().]/g, '').replace(/^\+/, '').replace(/^00/, '') : value;

const toBool = ({ value }: { value: any }) => (value === 'true' ? true : value === 'false' ? false : value);
const upper = ({ value }: { value: any }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);

export class CreateUserPaymentMethodDto {
  @IsEnum(UserPaymentMethodType)
  type: UserPaymentMethodType;

  @IsOptional() @IsString() @MaxLength(80)
  label?: string;

  /** MOBILE_MONEY : opérateur Pawapay (VODACOM_MPESA_COD, AIRTEL_COD, ORANGE_COD…) */
  @IsOptional() @Transform(upper) @Matches(/^[A-Z0-9_]{2,60}$/)
  provider?: string;

  /** MOBILE_MONEY : numéro (9 à 15 chiffres) */
  @IsOptional() @Transform(cleanPhone) @Matches(/^\d{9,15}$/)
  phone?: string;

  /** FPAY : compte affiché (numéro ou e-mail) */
  @IsOptional() @IsString() @MaxLength(120)
  fpayAccount?: string;

  @IsOptional() @Transform(upper) @IsIn(ACCEPTED_CURRENCIES)
  currency?: string;

  @IsOptional() @Transform(toBool) @IsBoolean()
  isDefault?: boolean;
}

/** Le type ne change pas : supprimer puis recréer */
export class UpdateUserPaymentMethodDto {
  @IsOptional() @IsString() @MaxLength(80)
  label?: string;

  @IsOptional() @Transform(upper) @Matches(/^[A-Z0-9_]{2,60}$/)
  provider?: string;

  @IsOptional() @Transform(cleanPhone) @Matches(/^\d{9,15}$/)
  phone?: string;

  @IsOptional() @IsString() @MaxLength(120)
  fpayAccount?: string;

  @IsOptional() @Transform(upper) @IsIn(ACCEPTED_CURRENCIES)
  currency?: string;

  @IsOptional() @Transform(toBool) @IsBoolean()
  isDefault?: boolean;
}
