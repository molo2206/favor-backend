import {
  IsOptional,
  IsString,
  Matches,
  IsEnum,
  ValidateIf,
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { UserRole } from '../enum/user-role-enum';
import validator from 'validator';

/** Validateur global pour au moins un champ email/phone valide */
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

          if (!email && !phone) return false;
          if (email && !validator.isEmail(email)) return false;
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

  @IsOptional()
  @Transform(({ value }) => (value?.trim() === '' ? undefined : value))
  @ValidateIf((o) => o.email !== undefined) // ✅ ne valide que si présent
  email?: string;

  @IsOptional()
  @Transform(({ value }) => (value?.trim() === '' ? undefined : value))
  @ValidateIf((o) => o.phone !== undefined) // ✅ ne valide que si présent
  phone?: string;

  @IsOptional()
  @EmailOrPhoneRequired()
  dummyValidationField?: string;

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
