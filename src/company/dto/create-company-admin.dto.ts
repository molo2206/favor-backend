import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUrl,
  IsNotEmpty,
  IsEnum,
  IsNumber,
  IsUUID,
  isNotEmpty,
} from 'class-validator';
import { CompanyActivity } from 'src/company/enum/activity.company.enum';
import { CompanyType } from 'src/company/enum/type.company.enum';

export class CreateCompanyAdminDto {
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

  @IsEnum(CompanyActivity, {
    message: `L'activité doit être : ${Object.values(CompanyActivity).join(', ')}`,
  })
  companyActivity?: CompanyActivity;

  @Type(() => Number)
  @IsNumber({}, { message: "Le champ 'taux' doit être un nombre valide" })
  taux: number;

  @IsString()
  localCurrency: string;

  @IsOptional()
  @IsUUID('4', { message: "Le champ 'countryId' doit être un UUID valide" })
  countryId?: string;

  @IsOptional()
  @IsUUID('4', { message: "Le champ 'cityId' doit être un UUID valide" })
  cityId?: string;

  @IsNotEmpty({ message: "Le champ 'userId' ne doit pas être vide" })
  @IsUUID('4', { message: "Le champ 'userId' doit être un UUID valide" })
  userId: string;

  @IsOptional()
  @IsUUID('4', { message: "Le champ 'categoryId' doit être un UUID valide" })
  categoryId?: string;
}
