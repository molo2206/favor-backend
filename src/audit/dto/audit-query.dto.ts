import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** ✅ Filtres du journal d'audit (GET /audit-logs) — tous facultatifs */
export class AuditQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit?: number = 20;

  /** Auteur */
  @IsOptional() @IsString() @MaxLength(255)
  userId?: string;

  /** Une ou plusieurs actions, séparées par des virgules (LOGIN,LOGIN_FAILED) */
  @IsOptional() @IsString() @MaxLength(500)
  action?: string;

  @IsOptional() @IsString() @MaxLength(100)
  entity?: string;

  @IsOptional() @IsString() @MaxLength(255)
  entityId?: string;

  /** SECURITY, ADMIN, FINANCE, BUSINESS, TECHNICAL (plusieurs séparées par des virgules) */
  @IsOptional() @IsString() @MaxLength(200)
  category?: string;

  /** INFO, WARNING, CRITICAL */
  @IsOptional() @IsString() @MaxLength(100)
  severity?: string;

  /** SUCCESS, FAILURE, DENIED */
  @IsOptional() @IsString() @MaxLength(100)
  status?: string;

  @IsOptional() @IsString() @MaxLength(50)
  platform?: string;

  @IsOptional() @IsString() @MaxLength(45)
  ipAddress?: string;

  @IsOptional() @IsString() @MaxLength(10)
  method?: string;

  @IsOptional() @IsString() @MaxLength(36)
  companyId?: string;

  @IsOptional() @IsString() @MaxLength(64)
  requestId?: string;

  /** Date de début (YYYY-MM-DD ou ISO) */
  @IsOptional() @IsString()
  from?: string;

  /** Date de fin incluse (YYYY-MM-DD ou ISO) */
  @IsOptional() @IsString()
  to?: string;

  /** Recherche : nom de l'auteur, ressource, route, identifiant, IP, message d'erreur */
  @IsOptional() @IsString() @MaxLength(150)
  search?: string;

  @IsOptional() @IsIn(['ASC', 'DESC', 'asc', 'desc'])
  sortOrder?: string;
}

export class AuditExportQueryDto extends AuditQueryDto {
  /** xlsx (défaut) ou pdf */
  @IsOptional() @IsIn(['xlsx', 'pdf'])
  format?: 'xlsx' | 'pdf';
}

export class AuditStatsQueryDto {
  @IsOptional() @IsString()
  from?: string;

  @IsOptional() @IsString()
  to?: string;

  @IsOptional() @IsString() @MaxLength(36)
  companyId?: string;
}
