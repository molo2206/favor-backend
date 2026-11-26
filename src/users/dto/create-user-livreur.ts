import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { VehicleType } from '../enum/user-vehiculetype.enum';


export class CreateLivreurDto {
    @IsNotEmpty({ message: 'Le nom complet ne peut pas être vide.' })
    @IsString({ message: 'Le nom complet doit être une chaîne de caractères.' })
    fullName: string;

    @IsNotEmpty({ message: 'L’adresse e-mail ne peut pas être vide.' })
    @IsEmail({}, { message: 'L’adresse e-mail doit être valide.' })
    email: string;

    @IsNotEmpty({ message: 'Le mot de passe ne peut pas être vide.' })
    @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères.' })
    @Matches(/(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])/, {
        message: 'Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre.',
    })
    password: string;

    @IsNotEmpty({ message: 'Le numéro de téléphone ne peut pas être vide.' })
    @IsString({ message: 'Le numéro de téléphone doit être une chaîne de caractères.' })
    phone: string;

    @IsEnum(VehicleType) vehicleType: VehicleType;

    @IsString() plateNumber: string;

    @IsOptional() @IsString() licenseUrl?: string;

    @IsString() country: string;

    @IsString() city: string;
}