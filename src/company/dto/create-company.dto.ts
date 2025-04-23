import { IsOptional, IsString, IsUrl, IsNotEmpty } from 'class-validator';

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
  @IsString()
  typeCompany?: string; 

}

