import { IsOptional, IsString, IsUrl, IsNotEmpty, IsEnum } from 'class-validator';
import { CompanyActivity } from 'src/users/utility/common/activity.company.enum';
import { CompanyType } from 'src/users/utility/common/type.company.enum';

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
  logo?: string | null;  // Permet de stocker null si le logo n'est pas présent

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
  @IsUrl({}, { message: 'The banner should be a valid URL or file path.' })
  banner?: string | null

  @IsEnum(CompanyActivity, {
    message: `L'activité doit être : ${Object.values(CompanyActivity).join(', ')}`,
  })
  companyActivity?: CompanyActivity;
}

