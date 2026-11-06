// src/backup/dto/backup.dto.ts
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "2:5" → "02:05", "14h30" → "14:30" */
const normTimes = ({ value }: { value: any }) => {
  const list = Array.isArray(value) ? value : String(value ?? '').split(',');
  return list
    .map((t: any) => String(t).trim().replace(/h/i, ':'))
    .filter(Boolean)
    .map((t: string) => {
      const [h, m = '0'] = t.split(':');
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    });
};

export class CreateBackupScheduleDto {
  @ApiProperty({ example: 'Sauvegarde de nuit' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: ['02:00', '14:00'], description: 'Heures locales HH:mm' })
  @Transform(normTimes)
  @IsArray()
  @ArrayMinSize(1, { message: 'Indiquez au moins une heure' })
  @ArrayMaxSize(24)
  @Matches(HHMM, { each: true, message: 'Heure invalide (format HH:mm, ex. 02:00)' })
  times: string[];

  @ApiPropertyOptional({ example: [1, 2, 3, 4, 5], description: '1 = lundi … 7 = dimanche ; vide = tous les jours' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  days?: number[];

  @ApiPropertyOptional({ example: 'Africa/Lubumbashi' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  timezone?: string;

  @ApiPropertyOptional({ example: 14, description: 'Nombre de sauvegardes gardées' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  keepLast?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  includeUploads?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Base MySQL à sauvegarder (défaut : base par défaut)' })
  @IsOptional()
  @IsUUID()
  databaseId?: string;
}

export class UpdateBackupScheduleDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;

  @IsOptional()
  @Transform(normTimes)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(24)
  @Matches(HHMM, { each: true, message: 'Heure invalide (format HH:mm, ex. 02:00)' })
  times?: string[];

  @IsOptional() @IsArray() @ArrayMaxSize(7) @Type(() => Number) @IsInt({ each: true }) @Min(1, { each: true }) @Max(7, { each: true })
  days?: number[];

  @IsOptional() @IsString() @MaxLength(60) timezone?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) keepLast?: number;
  @IsOptional() @IsBoolean() includeUploads?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  /** null = base par défaut */
  @IsOptional() @IsUUID() databaseId?: string | null;
}

export class ManualBackupDto {
  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  includeUploads?: boolean;

  @ApiPropertyOptional({ description: 'Base MySQL à sauvegarder (défaut : base par défaut)' })
  @IsOptional()
  @IsUUID()
  databaseId?: string;
}

// ============================================================
// ✅ BASES MYSQL À SAUVEGARDER
// ============================================================
const MYSQL_NAME = /^[A-Za-z0-9_$-]{1,64}$/;

/** Identifiants de connexion (test sans enregistrer, recherche des bases) */
export class MysqlConnectionDto {
  @ApiPropertyOptional({ example: '127.0.0.1' })
  @IsOptional() @IsString() @MaxLength(255)
  @Matches(/^[A-Za-z0-9.\-_:\[\]]+$/, { message: 'Hôte invalide' })
  host?: string;

  @ApiPropertyOptional({ example: 3306 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(65535)
  port?: number;

  @ApiPropertyOptional({ example: 'admin' })
  @IsOptional() @IsString() @MaxLength(100)
  username?: string;

  @ApiPropertyOptional({ description: 'Jamais renvoyé par l\'API' })
  @IsOptional() @IsString() @MaxLength(255)
  password?: string;

  @ApiPropertyOptional({ example: 'favor_db' })
  @IsOptional() @IsString() @Matches(MYSQL_NAME, { message: 'Nom de base invalide (lettres, chiffres, _ $ -)' })
  databaseName?: string;

  @ApiPropertyOptional({ description: 'Utiliser les identifiants MySQL de l\'application (.env)' })
  @IsOptional() @IsBoolean()
  useAppCredentials?: boolean;
}

export class CreateBackupDatabaseDto extends MysqlConnectionDto {
  @ApiProperty({ example: 'Base principale' })
  @IsString() @MinLength(2) @MaxLength(120)
  name: string;

  @IsOptional() @IsString() @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: ['audit_logs'], description: 'Tables exclues du dump' })
  @IsOptional() @IsArray() @ArrayMaxSize(100) @Matches(MYSQL_NAME, { each: true, message: 'Nom de table invalide' })
  excludeTables?: string[];

  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;

  /** Tester la connexion avant d'enregistrer (défaut : true) */
  @IsOptional() @IsBoolean() testBeforeSave?: boolean;
}

export class UpdateBackupDatabaseDto extends MysqlConnectionDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @Matches(MYSQL_NAME, { each: true, message: 'Nom de table invalide' }) excludeTables?: string[];
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  /** Effacer le mot de passe enregistré */
  @IsOptional() @IsBoolean() clearPassword?: boolean;
  @IsOptional() @IsBoolean() testBeforeSave?: boolean;
}

export class RestoreBackupDto {
  @ApiProperty({ example: 'RESTAURER', description: 'Confirmation obligatoire' })
  @IsString()
  @IsIn(['RESTAURER'], { message: 'Tapez RESTAURER pour confirmer la restauration' })
  confirm: string;
}

export class BackupRunsQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsIn(['RUNNING', 'SUCCESS', 'FAILED', 'SKIPPED']) status?: string;
  @IsOptional() @IsString() scheduleId?: string;
  @IsOptional() @IsUUID() databaseId?: string;
}

export class BackupFilesQueryDto {
  @IsOptional() @IsUUID() databaseId?: string;
}
