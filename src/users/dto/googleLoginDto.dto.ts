import { IsString, IsNotEmpty, IsEmail, IsOptional, IsIn } from 'class-validator';

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
  @IsIn(['ios', 'android', 'web', 'admin', 'group'], {
    message: 'La plateforme doit être ios, android, web, admin ou group',
  })
  platform?: 'ios' | 'android' | 'web' | 'admin' | 'group';

  @IsOptional()
  @IsString()
  provider?: string;
}