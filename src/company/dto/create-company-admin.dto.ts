import { BadRequestException } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUrl,
  IsNotEmpty,
  IsEnum,
  IsNumber,
  IsUUID,
  IsArray,
  ValidateNested,
  IsBoolean,
  Min,
} from 'class-validator';
import { CompanyActivity } from 'src/company/enum/activity.company.enum';
import { CompanyType } from 'src/company/enum/type.company.enum';
import { FeeBasis, FeeType } from '../entities/company.entity';

export class CreateCompanyAdminDto {
  @IsNotEmpty({ message: "Le nom de l'entreprise est requis" })
  @IsString()
  companyName: string;

  @IsOptional()
  @IsString()
  companyAddress?: string;

  @IsOptional()
  @IsString()
  vatNumber?: string;

  @IsOptional()
  @IsString()
  registrationDocumentUrl?: string;

  @IsOptional()
  @IsString()
  warehouseLocation?: string;

  @IsOptional()
  @IsString()
  @IsUrl({}, { message: 'The logo should be a valid URL or file path.' })
  logo?: string | null;

  @IsOptional()
  @IsEnum(CompanyType, {
    message: `Le type d'entreprise doit être l'une des valeurs suivantes : ${Object.values(CompanyType).join(', ')}`,
  })
  typeCompany?: CompanyType;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  delivery_minutes?: string;

  @IsOptional()
  @IsString()
  distance_km?: string;

  @IsOptional()
  @IsString()
  open_time?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  latitude?: string;

  @IsOptional()
  @IsString()
  longitude?: string;

  @IsOptional()
  @IsString()
  @IsUrl({}, { message: 'The banner should be a valid URL or file path.' })
  banner?: string | null;

  @IsOptional()
  @IsEnum(CompanyActivity, {
    message: `L'activité doit être : ${Object.values(CompanyActivity).join(', ')}`,
  })
  companyActivity?: CompanyActivity;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: "Le champ 'taux' doit être un nombre valide" })
  taux?: number;

  @IsOptional()
  @IsString({ message: 'localCurrency doit être une chaîne de caractères' })
  localCurrency?: string;

  @IsOptional()
  @IsUUID('4', { message: "Le champ 'countryId' doit être un UUID valide" })
  countryId?: string;

  @IsOptional()
  @IsUUID('4', { message: "Le champ 'cityId' doit être un UUID valide" })
  cityId?: string;

  @IsOptional()
  @IsUUID('4', { message: "Le champ 'userId' doit être un UUID valide" })
  userId?: string;

  @IsOptional()
  categoryId?: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsNumber()
  @Min(0)
  fee?: number;

  @IsOptional()
  @IsEnum(FeeType)
  feeType?: FeeType;

  @IsOptional()
  @IsEnum(FeeBasis)
  feeB?: FeeBasis;

  @IsOptional()
  @IsBoolean()
  isMain?: boolean;

  // ✅ Transformation correcte ici (conversion de la chaîne JSON en tableau)
  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return [];
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) {
          throw new Error();
        }
        return parsed;
      } catch {
        throw new BadRequestException('resources must be a valid JSON array');
      }
    }
    return value;
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ResourcePermissionDto)
  resources?: ResourcePermissionDto[];
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

export class ResourcePermissionDto {
  @IsUUID()
  resourceId: string;

  @IsOptional()
  @IsBoolean()
  canRead?: boolean;

  @IsOptional()
  @IsBoolean()
  canCreate?: boolean;

  @IsOptional()
  @IsBoolean()
  canUpdate?: boolean;

  @IsOptional()
  @IsBoolean()
  canDelete?: boolean;

  @IsOptional()
  @IsBoolean()
  canManage?: boolean;

  @IsOptional()
  @IsBoolean()
  status?: boolean;
}
