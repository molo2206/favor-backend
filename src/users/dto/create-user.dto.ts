import {
  IsOptional,
  IsString,
  Matches,
  IsEnum,
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import { Transform } from 'class-transformer'; // ✅ Correct
import { UserRole } from '../enum/user-role-enum';
import { IsEmailOrPhone } from '../utility/helpers/IsEmailOrPhone';

/**
 * Validateur pour au moins un champ requis
 */
export function AtLeastOneField(fields: string[], validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'atLeastOneField',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(_: any, args: ValidationArguments) {
          const obj = args.object as any;
          return fields.some((field) => obj[field] && obj[field].toString().trim() !== '');
        },
        defaultMessage() {
          return `Un email ou un numéro de téléphone est requis.`;
        },
      },
    });
  };
}

export class CreateUserDto {
  @IsString({ message: 'Le nom complet doit être une chaîne de caractères.' })
  fullName: string;

  // Transforme "" en undefined
  @Transform(({ value }) => (value?.trim() === '' ? undefined : value))
  @IsOptional()
  @IsEmailOrPhone({ message: 'Doit être un email ou un numéro de téléphone valide.' })
  email?: string;

  @Transform(({ value }) => (value?.trim() === '' ? undefined : value))
  @IsOptional()
  @IsEmailOrPhone({ message: 'Doit être un email ou un numéro de téléphone valide.' })
  phone?: string;

  // Vérifie qu'au moins un est rempli
  @AtLeastOneField(['email', 'phone'])
  dummyValidationField: string;

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
