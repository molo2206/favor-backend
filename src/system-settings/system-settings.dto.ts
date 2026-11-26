// src/system-settings/system-settings.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const KEY = /^[A-Z][A-Z0-9_]{1,99}$/;
const KEY_MSG = 'Nom de clé invalide : majuscules, chiffres et _ uniquement (ex. MA_CLE)';
const toBool = ({ value }: { value: any }) =>
  value === undefined || value === null || value === '' ? undefined : value === true || String(value).toLowerCase() === 'true' || value === '1';
const toUpperKey = ({ value }: { value: any }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);

export class SystemSettingsQueryDto {
  @IsOptional() @IsString() @MaxLength(40) category?: string;
  /** Recherche dans le nom de la clé et la description */
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  /** DATABASE = gérée en base, ENV = valeur du .env, UNSET = non renseignée, PROTECTED = reste dans le .env */
  @IsOptional() @IsIn(['DATABASE', 'ENV', 'UNSET', 'PROTECTED']) source?: string;
  @IsOptional() @Transform(toBool) @IsBoolean() secret?: boolean;
  /** true = seulement les paramètres qui demandent un redémarrage */
  @IsOptional() @Transform(toBool) @IsBoolean() pendingRestart?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(300) limit?: number;
}

export class UpsertSystemSettingDto {
  @ApiPropertyOptional({ description: 'Nouvelle valeur (texte). Omis = valeur inchangée (seulement description / état).' })
  @IsOptional() @IsString() @MaxLength(20000, { message: 'Valeur trop longue (20 000 caractères maximum)' })
  value?: string;

  @ApiPropertyOptional({ description: 'Chiffrer et masquer la valeur (défaut : selon le nom de la clé)' })
  @IsOptional() @IsBoolean() isSecret?: boolean;

  @ApiPropertyOptional({ description: 'false = garder en base mais utiliser la valeur du .env' })
  @IsOptional() @IsBoolean() isActive?: boolean;

  @IsOptional() @IsString() @MaxLength(40) category?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;

  @ApiPropertyOptional({ description: 'Motif de la modification (historique)' })
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class BulkSystemSettingItemDto extends UpsertSystemSettingDto {
  @ApiProperty({ example: 'OPENAI_MODEL' })
  @Transform(toUpperKey) @IsString() @Matches(KEY, { message: KEY_MSG })
  key: string;
}

export class BulkSystemSettingsDto {
  @ApiProperty({ type: [BulkSystemSettingItemDto] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(300)
  @ValidateNested({ each: true }) @Type(() => BulkSystemSettingItemDto)
  items: BulkSystemSettingItemDto[];

  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class SetSystemSettingActiveDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  isActive: boolean;
}

export class ImportSystemSettingsDto {
  @ApiPropertyOptional({ enum: ['ENV_FILE', 'TEXT'], description: 'ENV_FILE = fichier .env du serveur ; TEXT = contenu collé' })
  @IsOptional() @IsIn(['ENV_FILE', 'TEXT']) source?: 'ENV_FILE' | 'TEXT';

  @ApiPropertyOptional({ description: 'Contenu au format .env (source = TEXT)' })
  @IsOptional() @IsString() @MaxLength(500000) content?: string;

  @ApiPropertyOptional({ description: 'Limiter l\'import à ces clés' })
  @IsOptional() @IsArray() @ArrayMaxSize(500) @Transform(({ value }) => (Array.isArray(value) ? value.map((v: any) => String(v).trim().toUpperCase()) : value))
  @Matches(KEY, { each: true, message: KEY_MSG })
  keys?: string[];

  @ApiPropertyOptional({ description: 'Remplacer les valeurs déjà en base (défaut : false)' })
  @IsOptional() @IsBoolean() overwrite?: boolean;

  @ApiPropertyOptional({ description: 'Seulement les clés connues du catalogue (défaut : false)' })
  @IsOptional() @IsBoolean() onlyCatalog?: boolean;

  @ApiPropertyOptional({ description: 'true = aperçu sans rien enregistrer' })
  @IsOptional() @IsBoolean() dryRun?: boolean;

  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class SystemSettingHistoryQueryDto {
  @IsOptional() @Transform(toUpperKey) @IsString() @Matches(KEY, { message: KEY_MSG }) key?: string;
  @IsOptional() @IsIn(['CREATE', 'UPDATE', 'ENABLE', 'DISABLE', 'DELETE', 'IMPORT', 'ROLLBACK']) action?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class ExportSystemSettingsQueryDto {
  /** true = valeurs secrètes en clair (super admin, journalisé) */
  @IsOptional() @Transform(toBool) @IsBoolean() includeSecrets?: boolean;
  /** true = toutes les valeurs effectives (base + .env) ; défaut : seulement celles de la base */
  @IsOptional() @Transform(toBool) @IsBoolean() effective?: boolean;
}
