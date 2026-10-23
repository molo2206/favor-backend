import { Transform, Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUrl,
  IsNotEmpty,
  IsEnum,
  IsNumber,
  IsUUID,
  Min,
  IsBoolean,
} from 'class-validator';
import { CompanyActivity } from 'src/company/enum/activity.company.enum';
import { CompanyType } from 'src/company/enum/type.company.enum';
import { CompanyPlatform, FeeBasis, FeeType } from '../entities/company.entity';

export class CreateCompanyDto {
  @IsNotEmpty()
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
  logo?: string | null; // Permet de stocker null si le logo n'est pas présent

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

  // ✅ AJOUT : jours et heures d'ouverture
  /** ["MONDAY","FRIDAY"] | "lundi,mardi" | "MONDAY-FRIDAY" | '["MONDAY"]' (form-data) */
  @IsOptional()
  opening_days?: string[] | string;

  /** "08:00" */
  @IsOptional()
  @IsString()
  opening_time?: string;

  /** "18:00" (ou "02:00" pour une fermeture après minuit) */
  @IsOptional()
  @IsString()
  closing_time?: string;

  @IsOptional()
  @IsString()
  address: string;

  @IsOptional()
  @IsString()
  latitude: string;

  @IsOptional()
  @IsString()
  longitude: string;

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
  taux: number;

  @IsOptional()
  @IsString()
  localCurrency: string;

  @IsOptional()
  @IsUUID('4', { message: "Le champ 'countryId' doit être un UUID valide" })
  countryId?: string;

  @IsOptional()
  @IsUUID('4', { message: "Le champ 'cityId' doit être un UUID valide" })
  cityId?: string;

  @IsOptional()
  @IsUUID('4', { message: "Le champ 'categoryId' doit être un UUID valide" })
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

  @IsOptional()
  @IsEnum(CompanyPlatform, {
    message: `La plateforme doit être l'une des valeurs suivantes : ${Object.values(CompanyPlatform).join(', ')}`,
  })
  typePlatform?: CompanyPlatform;
}
