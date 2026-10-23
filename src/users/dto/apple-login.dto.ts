import { IsString, IsOptional, IsEmail, IsIn } from 'class-validator';
import { Transform } from 'class-transformer';

export class AppleLoginDto {
  @IsString()
  appleUserId: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? undefined : value))
  fullName?: string;

  @IsOptional()
  @IsEmail()
  @Transform(({ value }) => (value === '' ? undefined : value))
  email?: string;

  @IsOptional()
  @IsString()
  fcmToken?: string;

  @IsOptional()
  @IsIn(['ios', 'android', 'web', 'admin', 'group'], {
    message: 'La plateforme doit être ios, android, web, admin ou group',
  })
  platform?: 'ios' | 'android' | 'web' | 'admin' | 'group';
}