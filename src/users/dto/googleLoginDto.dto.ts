import { IsString, IsNotEmpty, IsEmail, IsOptional } from 'class-validator';

export class GoogleLoginDto {
  @IsEmail()
  email: string;

  @IsNotEmpty()
  fullName: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsString()
  fcmToken?: string;

  @IsOptional()
  @IsString()
  platform?: 'ios' | 'android' | 'web';

  @IsOptional()
  @IsString()
  provider?: string;
}
