import { IsNotEmpty, IsString, Validate } from 'class-validator';
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

export class LoginUserDto {
  @IsNotEmpty({ message: 'Veuillez fournir un email ou un numéro de téléphone' })
  @IsString()
  @Validate(IsEmailOrPhoneConstraint)
  email: string; // reste email pour la compatibilité existante

  @IsNotEmpty({ message: 'Le mot de passe ne peut pas être vide' })
  @IsString()
  password: string;
}
