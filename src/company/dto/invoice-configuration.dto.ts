// src/company/dto/create-invoice-configuration.dto.ts
import { IsEmail, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateInvoiceConfigurationDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  logo?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  rccm?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  website?: string;
}

export class UpdateInvoiceConfigurationDto extends CreateInvoiceConfigurationDto {}