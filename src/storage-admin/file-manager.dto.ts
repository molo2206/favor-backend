// src/storage-admin/file-manager.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

const toBool = ({ value }: { value: any }) =>
  value === undefined || value === null || value === '' ? undefined : value === true || String(value).toLowerCase() === 'true' || value === '1';

export class FmPathQueryDto {
  @ApiPropertyOptional({ example: 'storage' }) @IsOptional() @IsString() @MaxLength(30) root?: string;
  @ApiPropertyOptional({ example: 'product' }) @IsOptional() @IsString() @MaxLength(700) path?: string;
}

export class FmListQueryDto extends FmPathQueryDto {
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsIn(['image', 'video', 'audio', 'document', 'archive', 'other', 'dir']) kind?: string;
  @IsOptional() @IsIn(['name', 'size', 'date']) sort?: string;
  @IsOptional() @IsIn(['asc', 'desc']) order?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
}

export class FmSearchQueryDto {
  @IsOptional() @IsString() @MaxLength(30) root?: string;
  @IsOptional() @IsString() @MaxLength(700) path?: string;
  @ApiProperty({ example: 'logo' }) @IsString() @MaxLength(100) q: string;
  @IsOptional() @IsIn(['image', 'video', 'audio', 'document', 'archive', 'other']) kind?: string;
  /** Fichiers plus gros que (Mo) */
  @IsOptional() @Type(() => Number) @Min(0) minSizeMb?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
}

export class FmDownloadQueryDto extends FmPathQueryDto {
  @IsOptional() @Transform(toBool) @IsBoolean() inline?: boolean;
}

export class FmUploadDto extends FmPathQueryDto {
  /** true = remplacer un fichier du même nom (sinon « nom (1).ext ») */
  @IsOptional() @Transform(toBool) @IsBoolean() overwrite?: boolean;
}

export class FmCreateFolderDto extends FmPathQueryDto {
  @ApiProperty({ example: 'promotions' }) @IsString() @MaxLength(200) name: string;
}

export class FmRenameDto extends FmPathQueryDto {
  @ApiProperty({ example: 'nouveau-nom.webp' }) @IsString() @MaxLength(200) newName: string;
  /** Renommer même si le fichier est utilisé en base (ses liens ne marcheront plus) */
  @IsOptional() @IsBoolean() force?: boolean;
}

export class FmMoveDto {
  @IsOptional() @IsString() @MaxLength(30) root?: string;
  @ApiProperty({ example: ['product/a.webp'] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @IsString({ each: true }) @MaxLength(700, { each: true })
  paths: string[];
  /** Dossier de destination (relatif à la racine) */
  @ApiProperty({ example: 'archives/2026' }) @IsString() @MaxLength(700) destination: string;
  /** Racine de destination (défaut : la même) */
  @IsOptional() @IsString() @MaxLength(30) destinationRoot?: string;
  /** true = copier au lieu de déplacer */
  @IsOptional() @IsBoolean() copy?: boolean;
  @IsOptional() @IsBoolean() force?: boolean;
}

export class FmDeleteDto {
  @IsOptional() @IsString() @MaxLength(30) root?: string;
  @ApiProperty({ example: ['product/a.webp'] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(1000) @IsString({ each: true }) @MaxLength(700, { each: true })
  paths: string[];
  /** Supprimer même si le fichier est utilisé en base */
  @IsOptional() @IsBoolean() force?: boolean;
  /** true = suppression définitive (sinon corbeille, restaurable) */
  @IsOptional() @IsBoolean() permanent?: boolean;
}

export class FmTrashQueryDto {
  @IsOptional() @IsString() @MaxLength(30) root?: string;
  @IsOptional() @IsIn(['MANUAL', 'REJECTED_PRODUCT', 'REJECTED_COMPANY', 'ORPHAN']) reason?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

export class FmTrashIdsDto {
  @ApiProperty() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(1000) @IsUUID('all', { each: true }) ids: string[];
  /** Restauration : remplacer le fichier s'il existe déjà à son emplacement */
  @IsOptional() @IsBoolean() overwrite?: boolean;
}

export class FmEmptyTrashDto {
  /** Vider seulement ces éléments (sinon : tout, ou seulement les expirés si expiredOnly) */
  @IsOptional() @IsArray() @ArrayMaxSize(1000) @IsUUID('all', { each: true }) ids?: string[];
  @IsOptional() @IsBoolean() expiredOnly?: boolean;
  @ApiProperty({ example: 'VIDER', description: 'Confirmation obligatoire' }) @IsString() @IsIn(['VIDER'], { message: 'Tapez VIDER pour confirmer' }) confirm: string;
}

export class FmOrphanScanDto {
  @IsOptional() @IsString() @MaxLength(30) root?: string;
  /** Seulement les fichiers plus anciens que (jours) — défaut 7 */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(3650) olderThanDays?: number;
  /** Limiter à un sous-dossier */
  @IsOptional() @IsString() @MaxLength(700) path?: string;
}

export class FmOrphanListDto {
  @IsOptional() @IsString() @MaxLength(700) folder?: string;
  @IsOptional() @IsIn(['image', 'video', 'audio', 'document', 'archive', 'other']) kind?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
}

export class FmOrphanCleanDto {
  /** Fichiers à mettre à la corbeille (sinon : tous les orphelins trouvés) */
  @IsOptional() @IsArray() @ArrayMaxSize(10000) @IsString({ each: true }) paths?: string[];
  @IsOptional() @IsString() @MaxLength(700) folder?: string;
  @ApiProperty({ example: 'NETTOYER' }) @IsString() @IsIn(['NETTOYER'], { message: 'Tapez NETTOYER pour confirmer' }) confirm: string;
}

// ============================================================
// ✅ PURGE DES PRODUITS / ENTREPRISES REJETÉS
// ============================================================
export class PurgeRejectedDto {
  /** PRODUCTS, COMPANIES ou ALL (défaut) */
  @IsOptional() @IsIn(['PRODUCTS', 'COMPANIES', 'ALL']) target?: 'PRODUCTS' | 'COMPANIES' | 'ALL';
  /** Rejetés depuis au moins N jours (défaut : PURGE_REJECTED_MIN_DAYS = 30 ; 0 = tous) */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(3650) olderThanDays?: number;
  /** Seulement ces produits / entreprises */
  @IsOptional() @IsArray() @ArrayMaxSize(1000) @IsUUID('all', { each: true }) productIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(500) @IsUUID('all', { each: true }) companyIds?: string[];
  /** true = aperçu sans rien supprimer (défaut : true) */
  @IsOptional() @IsBoolean() dryRun?: boolean;
  /** true = fichiers supprimés définitivement (sinon corbeille 30 jours) */
  @IsOptional() @IsBoolean() permanentFiles?: boolean;
  /** Obligatoire quand dryRun = false */
  @IsOptional() @IsString() @IsIn(['SUPPRIMER'], { message: 'Tapez SUPPRIMER pour confirmer' }) confirm?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5000) limit?: number;
}
