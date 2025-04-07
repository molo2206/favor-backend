import { IsEmail, IsOptional, IsString, MinLength, IsDate, IsNotEmpty, Matches } from 'class-validator';

export class CreateClientDto {
    @IsNotEmpty({ message: 'Full name cannot be null' })
    @IsString({ message: 'Full name must be a string' })
    fullName: string;

    @IsNotEmpty({ message: 'Email cannot be null' })
    @IsEmail({}, { message: 'Email must be a valid email address' })
    email: string;

    @IsNotEmpty({ message: 'Password cannot be null' })
    @MinLength(8, { message: 'Password must be at least 8 characters long' })
    @Matches(/(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])/, {
        message: 'Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre.',
    })
    password: string;

    @IsNotEmpty({ message: 'Phone cannot be null' })
    @IsString({ message: 'Phone must be a string' })
    phone: string;

    @IsOptional()
    @IsString()
    address?: string;

    @IsOptional()
    @IsDate()
    dateOfBirth?: Date;

    @IsString()
    country: string;

    @IsString()
    city: string;
}
