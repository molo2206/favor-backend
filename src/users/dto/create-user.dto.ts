import {
  IsString,
  Matches,
  IsEnum,
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
  IsOptional,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { UserRole } from '../enum/user-role-enum';
import validator from 'validator';

/** ✅ Validateur global pour au moins un champ email/phone valide */
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
          const email = obj.email;
          const phone = obj.phone;

          console.log('🔍 VALIDATION DEBUG - Email:', email, 'Phone:', phone);

          // Ignorer les chaînes vides
          const hasEmail = email && email !== '';
          const hasPhone = phone && phone !== '';

          // Aucun champ fourni → valide
          if (!hasEmail && !hasPhone) {
            console.log('✅ Aucun champ requis fourni - VALIDE');
            return true;
          }

          // Email fourni → doit être valide
          if (hasEmail && !validator.isEmail(email)) {
            console.log('❌ Email invalide');
            return false;
          }

          // Phone fourni → doit être valide
          if (hasPhone && !validator.isMobilePhone(phone, 'any')) {
            console.log('❌ Phone invalide');
            return false;
          }

          // Au moins un champ valide
          console.log('✅ Au moins un champ valide - VALIDE');
          return true;
        },
        defaultMessage() {
          return 'Un email valide ou un numéro de téléphone valide est requis.';
        },
      },
    });
  };
}

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

  // ✅ Validation globale
  @EmailOrPhoneRequired()
  emailOrPhoneValidation?: string;

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