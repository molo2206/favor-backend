// reset-password.dto.ts

import { IsEmail, IsNotEmpty, Matches } from 'class-validator';

export class ResetPasswordDto {
    @IsNotEmpty({ message: 'Email cannot be null' })
    @IsEmail({}, { message: 'Email must be a valid email address' })
    email: string;

    @IsNotEmpty({ message: "Le code OTP est requis." })
    otpCode: string;

    @IsNotEmpty({ message: "Le mot de passe est requis." })
    @Matches(/(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])/, {
        message: 'Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre.',
    })
    password: string;
}
