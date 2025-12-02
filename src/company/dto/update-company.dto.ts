// src/company/dto/update-company.dto.ts
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  companyName?: string;

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
  logo?: string;

  @IsOptional()
  @IsString()
  banner?: string;

  @IsOptional()
  @IsString()
  typeCompany?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  delivery_minutes?: string;

  @IsOptional()
  @IsString()
  distance_km?: string;

  @IsOptional()
  @IsString()
  open_time?: string;

  @IsNotEmpty({ message: 'L’adresse est obligatoire.' })
  address: string;

  @IsNotEmpty({ message: 'La latitude est obligatoire.' })
  latitude: string;

  @IsNotEmpty({ message: 'La longitude est obligatoire.' })
  longitude: string;

  @Type(() => Number)
  @IsNumber()
  taux: number;

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
}
