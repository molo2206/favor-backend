
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, Length, Matches } from 'class-validator';
import { UserRole } from '../utility/common/user-role-enum';



export class CreateUserDto {

    @IsNotEmpty({ message: 'Le nom complet est requis.' })
    @IsString({ message: 'Le nom complet doit être une chaîne de caractères.' })
    fullName: string;

    @IsNotEmpty({ message: 'L\'email est requis.' })
    @IsEmail({}, { message: 'Email invalide.' })
    email: string;

    @IsNotEmpty({ message: 'Le numéro de téléphone est requis.' })
    @IsString({ message: 'Le numéro de téléphone doit être une chaîne de caractères.' })
    phone: string;

    @IsNotEmpty({ message: 'Le mot de passe est requis.' })
    @Length(6, 20, {
        message: 'Le mot de passe doit contenir entre 6 et 20 caractères.',
    })
    @Matches(/(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])/, {
        message: 'Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre.',
    })
    password: string;

    @IsNotEmpty({ message: 'Le pays est requis.' })
    @IsString({ message: 'Le pays doit être une chaîne de caractères.' })
    country: string;

    @IsNotEmpty({ message: 'La ville est requise.' })
    @IsString({ message: 'La ville doit être une chaîne de caractères.' })
    city: string;

    @IsOptional()
    @IsString() address?: string;

    @IsOptional() @IsString() otpCode?: string;

    @IsOptional() @IsEnum(UserRole, { each: true }) roles?: UserRole;
}
