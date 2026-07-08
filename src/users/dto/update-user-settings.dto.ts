// src/users/dto/update-user-settings.dto.ts
import { IsOptional, IsString, IsBoolean, IsIn } from 'class-validator';

export class UpdateUserSettingsDto {
  @IsOptional()
  @IsString()
  @IsIn(['fr', 'en', 'es', 'ar'], { message: 'Langue non supportée' })
  language?: string;

  @IsOptional()
  @IsString()
  @IsIn(['light', 'dark', 'system'])
  theme?: string;

  @IsOptional()
  @IsBoolean()
  emailNotifications?: boolean;

  @IsOptional()
  @IsBoolean()
  smsNotifications?: boolean;

  @IsOptional()
  @IsBoolean()
  pushNotifications?: boolean;

  @IsOptional()
  @IsBoolean()
  twoFactorEnabled?: boolean;

  @IsOptional()
  @IsString()
  lastDevice?: string;
}
