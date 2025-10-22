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
import { IsEmailOrPhone } from '../utility/helpers/IsEmailOrPhone';

/**
 * ✅ Validateur personnalisé pour s'assurer qu'au moins un des deux champs est fourni.
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

  @IsEmailOrPhone({ message: 'Doit être un email ou un numéro de téléphone valide.' })
  email?: string;

  @IsEmailOrPhone({ message: 'Doit être un email ou un numéro de téléphone valide.' })
  phone?: string;

  // ✅ Vérifie qu'au moins un est fourni
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
  @Transform(({ value }) => (value ? value : UserRole.CUSTOMER))
  roles?: UserRole = UserRole.CUSTOMER;

  @IsOptional()
  @IsString()
  fcmToken?: string;

  @IsOptional()
  @IsString()
  platform?: 'ios' | 'android' | 'web';
}
