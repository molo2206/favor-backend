import { IsString, IsNotEmpty, IsEmail, IsOptional } from 'class-validator';

// DTO attendu côté backend
export class GoogleLoginDto {
  @IsEmail()
  email: string;

  @IsNotEmpty()
  fullName: string;

  @IsNotEmpty()
  @IsString()
  image?: string;

  @IsOptional()
  @IsString()
  fcmToken?: string;

  @IsOptional()
  @IsString()
  platform?: 'ios' | 'android' | 'web';
}
