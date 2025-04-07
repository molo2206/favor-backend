import { IsEmail, IsNotEmpty, Matches, MinLength } from 'class-validator';

export class LoginUserDto {
    @IsNotEmpty({ message: 'Email cannot be null' })
    @IsEmail({}, { message: 'Email must be a valid email address' })
    email: string;

    @IsNotEmpty({ message: 'Password cannot be null' })
    @MinLength(8, { message: 'Password must be at least 8 characters long' })
    @Matches(/(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])/, {
        message: 'Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre.',
    })
    password: string;
}