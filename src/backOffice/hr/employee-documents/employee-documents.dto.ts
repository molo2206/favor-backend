// src/backOffice/hr/employee-documents/employee-documents.dto.ts
import { Transform, Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { EMPLOYEE_DOCUMENT_CATEGORIES } from './employee-document.entity';

const trim = ({ value }: { value: any }) => (typeof value === 'string' ? value.trim() : value);
const upper = ({ value }: { value: any }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);
const emptyToUndef = ({ value }: { value: any }) => (value === '' || value === 'null' ? undefined : value);

/** Champs du formulaire multipart (les mêmes valeurs s'appliquent à tous les fichiers envoyés) */
export class UploadEmployeeDocumentsDto {
  @IsOptional()
  @Transform(upper)
  @IsIn(EMPLOYEE_DOCUMENT_CATEGORIES as unknown as string[])
  category?: string;

  /** Titre (par défaut : nom du fichier) */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  documentNumber?: string;

  @IsOptional()
  @Transform(emptyToUndef)
  @IsDateString()
  issuedAt?: string;

  @IsOptional()
  @Transform(emptyToUndef)
  @IsDateString()
  expiresAt?: string;
}

export class UpdateEmployeeDocumentDto extends UploadEmployeeDocumentsDto {}

export class EmployeeDocumentsQueryDto {
  @IsOptional()
  @Transform(upper)
  @IsIn(EMPLOYEE_DOCUMENT_CATEGORIES as unknown as string[])
  category?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  search?: string;

  /** valid | expiring | expired */
  @IsOptional()
  @IsIn(['valid', 'expiring', 'expired'])
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class ExpiringDocumentsQueryDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  /** Documents qui expirent dans les N prochains jours (déjà expirés inclus) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
