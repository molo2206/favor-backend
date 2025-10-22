import {
  IsOptional,
  IsString,
  Matches,
  IsEnum,
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { UserRole } from '../enum/user-role-enum';
import validator from 'validator';

/**
 * Valide qu'au moins un des champs est présent et correct.
 */
export function EmailOrPhoneRequired(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'emailOrPhoneRequired',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(_: any, args: ValidationArguments) {
          const obj = args.object as any;
          const email = obj.email?.trim();
          const phone = obj.phone?.trim();

          if (!email && !phone) return false; // aucun champ fourni

          // si email présent, vérifier format
          if (email && !validator.isEmail(email)) return false;

          // si phone présent, vérifier format
          if (phone && !validator.isMobilePhone(phone, 'any')) return false;

          return true;
        },
        defaultMessage() {
          return `Un email valide ou un numéro de téléphone valide est requis.`;
        },
      },
    });
  };
}

export class CreateUserDto {
  @IsString({ message: 'Le nom complet doit être une chaîne de caractères.' })
  fullName: string;

  @Transform(({ value }) => (value?.trim() === '' ? undefined : value))
  email?: string;

  @Transform(({ value }) => (value?.trim() === '' ? undefined : value))
  phone?: string;

  @EmailOrPhoneRequired()
  dummyValidationField: string; // champ virtuel pour validation

  @IsOptional()
  @IsString()
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
  roles?: UserRole = UserRole.CUSTOMER;

  @IsOptional()
  @IsString()
  fcmToken?: string;

  @IsOptional()
  @IsString()
  platform?: 'ios' | 'android' | 'web';
}
