// src/users/dto/update-user-settings.dto.ts
import { IsOptional, IsString, IsBoolean } from 'class-validator';

export class UpdateUserSettingsDto {
  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
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

  // ✅ AJOUT DU CHAMP CURRENCY (sans validation @IsIn)
  @IsOptional()
  @IsString()
  currency?: string;
}