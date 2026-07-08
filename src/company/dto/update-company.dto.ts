import { Type, Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUrl,
  IsNotEmpty,
  IsEnum,
  IsNumber,
  IsUUID,
} from 'class-validator';
import { CompanyActivity } from 'src/company/enum/activity.company.enum';
import { CompanyType } from 'src/company/enum/type.company.enum';

const emptyToUndefined = ({ value }: { value: any }) =>
  value === '' || value === null ? undefined : value;

export class CreateCompanyAdminDto {
  @IsNotEmpty()
  @IsString()
  companyName: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  companyAddress?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  vatNumber?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  registrationDocumentUrl?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  warehouseLocation?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @IsUrl({}, { message: 'The logo should be a valid URL or file path.' })
  logo?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsEnum(CompanyType, {
    message: `Le type d'entreprise doit être l'une des valeurs suivantes : ${Object.values(CompanyType).join(', ')}`,
  })
  typeCompany?: CompanyType;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  phone?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  email?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  website?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  delivery_minutes?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  distance_km?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  open_time?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  address?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  latitude?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  longitude?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @IsUrl({}, { message: 'The banner should be a valid URL or file path.' })
  banner?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsEnum(CompanyActivity, {
    message: `L'activité doit être : ${Object.values(CompanyActivity).join(', ')}`,
  })
  companyActivity?: CompanyActivity;

  // ✅ OPTIONNEL + sécurisé
  @IsOptional()
  @Transform(emptyToUndefined)
  @Type(() => Number)
  @IsNumber({}, { message: "Le champ 'taux' doit être un nombre valide" })
  taux?: number;

  // ✅ OPTIONNEL
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  localCurrency?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID('4', { message: "Le champ 'countryId' doit être un UUID valide" })
  countryId?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID('4', { message: "Le champ 'cityId' doit être un UUID valide" })
  cityId?: string;

  // ✅ OPTIONNEL (corrige ton erreur principale)
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID('4', { message: "Le champ 'userId' doit être un UUID valide" })
  userId?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID('4', { message: "Le champ 'categoryId' doit être un UUID valide" })
  categoryId?: string;
}
