import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';
import validator from 'validator';

export function IsEmailOrPhone(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isEmailOrPhone',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          if (!value || value.toString().trim() === '') return true; // ✅ ignore les chaînes vides
          return validator.isEmail(value) || validator.isMobilePhone(value, 'any');
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} doit être un email ou un numéro de téléphone valide.`;
        },
      },
    });
  };
}
