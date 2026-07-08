// src/company-tariff/dto/update-company-tariff.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateCompanyTariffDto } from './create-company-tariff.dto';

export class UpdateCompanyTariffDto extends PartialType(
  CreateCompanyTariffDto,
) {}
