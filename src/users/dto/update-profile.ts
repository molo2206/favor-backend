// DTO : update-user.dto.ts
import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';
import { IsOptional, IsString } from 'class-validator';

/**
 * PATCH users/me — profil SANS email ni téléphone.
 * ✅ Email : PATCH users/me/email — Téléphone : PATCH users/me/phone
 */
export class UpdateUserDto extends PartialType(OmitType(CreateUserDto, ['email', 'phone'] as const)) {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsString()
  role?: string; // ou number selon ton modèle
}
