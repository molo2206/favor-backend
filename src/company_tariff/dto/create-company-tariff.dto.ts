import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsNumber,
  IsBoolean,
  IsEnum,
  IsUUID,
  Min,
} from 'class-validator';
import { CompanyType } from 'src/company/enum/type.company.enum';
import { ServiceType } from '../entities/company-tariff.entity';

export class CreateCompanyTariffDto {
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsEnum(CompanyType)
  company_type?: CompanyType;

  @IsOptional()
  @IsEnum(ServiceType)
  service_type?: ServiceType;

  @IsOptional()
  @IsString()
  from_country?: string;

  @IsOptional()
  @IsString()
  from_city?: string;

  @IsOptional()
  @IsString()
  to_country?: string;

  @IsOptional()
  @IsString()
  to_city?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false }, { message: 'base_price doit être un nombre valide' })
  @Min(0, { message: 'base_price ne peut pas être négatif' })
  base_price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  price_per_km?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  price_per_kg?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  price_per_item?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  min_price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  max_price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  max_weight?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  max_distance?: number;

  @IsOptional()
  @IsString()
  currency?: string; // ex: 'XAF', 'EUR'

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}