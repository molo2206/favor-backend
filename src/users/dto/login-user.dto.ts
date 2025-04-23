import { IsEmail, IsNotEmpty } from 'class-validator';

export class LoginUserDto {
    @IsNotEmpty({ message: 'Une adresse e-mail doit être fournie' })
    @IsEmail({}, { message: 'Format d’adresse e-mail invalide' })
    email: string;

    @IsNotEmpty({ message: 'Password cannot be null' })
    password: string;
}