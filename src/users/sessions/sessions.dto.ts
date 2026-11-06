// src/users/sessions/sessions.dto.ts
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class MySessionsQueryDto {
  /** true : inclure les sessions fermées des 30 derniers jours */
  @IsOptional() @IsIn(['true', 'false']) all?: string;
}

/** Liste des sessions (admin) */
export class SessionsQueryDto {
  @IsOptional() @IsUUID() userId?: string;
  /** active (défaut), revoked, expired, all */
  @IsOptional() @IsIn(['active', 'revoked', 'expired', 'all']) status?: string;
  @IsOptional() @IsString() @MaxLength(20) platform?: string;
  @IsOptional() @IsString() @MaxLength(45) ip?: string;
  /** Nom, e-mail, téléphone de l'utilisateur, appareil */
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  /** Activité depuis (YYYY-MM-DD ou ISO) */
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @IsIn(['lastActiveAt', 'createdAt']) sortBy?: string;
  @IsOptional() @IsIn(['ASC', 'DESC', 'asc', 'desc']) sortOrder?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

export class RevokeSessionDto {
  /** Motif (affiché dans l'historique) */
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}
