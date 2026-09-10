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
  @IsIn(['ios', 'android', 'web'], { 
    message: 'La plateforme doit être ios, android ou web' 
  })
  platform?: 'ios' | 'android' | 'web';
}
