import { IsNotEmpty, IsString, Matches, Validate } from 'class-validator';
import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import * as validator from 'validator';

@ValidatorConstraint({ name: 'isEmailOrPhone', async: false })
export class IsEmailOrPhoneConstraint implements ValidatorConstraintInterface {
  validate(value: string, args: ValidationArguments) {
    return validator.isEmail(value) || validator.isMobilePhone(value, 'any');
  }

  defaultMessage(args: ValidationArguments) {
    return 'Le champ doit être une adresse e-mail valide ou un numéro de téléphone valide';
  }
}

export class ResetPasswordDto {
  @IsNotEmpty({ message: 'Veuillez fournir un email ou un numéro de téléphone' })
  @IsString()
  @Validate(IsEmailOrPhoneConstraint)
  email: string; // reste email pour la compatibilité existante

  @IsNotEmpty({ message: 'Le code OTP est requis.' })
  otpCode: string;

  @IsNotEmpty({ message: 'Le mot de passe est requis.' })
  @Matches(/(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])/, {
    message:
      'Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre.',
  })
  password: string;
}
