import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Length, Validate } from 'class-validator';
import { ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments } from 'class-validator';
import * as validator from 'validator';

// Validator custom pour email ou téléphone
@ValidatorConstraint({ name: 'isEmailOrPhone', async: false })
export class IsEmailOrPhoneConstraint implements ValidatorConstraintInterface {
  validate(value: string, args: ValidationArguments) {
    return validator.isEmail(value) || validator.isMobilePhone(value, 'any');
  }

  defaultMessage(args: ValidationArguments) {
    return 'Le champ doit être une adresse e-mail valide ou un numéro de téléphone valide';
  }
}

export class VerifyOtpDto {
  @Transform(({ value }) => value.toLowerCase())
  @IsNotEmpty({ message: 'Veuillez fournir un email ou un numéro de téléphone' })
  @IsString()
  @Validate(IsEmailOrPhoneConstraint)
  email: string; // reste email pour compatibilité

  @IsString()
  @Length(4, 4, { message: 'Le code OTP doit contenir 4 chiffres' })
  @IsNotEmpty({ message: 'Le code OTP est requis' })
  otpCode: string;
}
