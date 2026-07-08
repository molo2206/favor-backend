// src/search/dto/search.dto.ts
import { IsOptional, IsString, IsEnum } from 'class-validator';
import { CompanyType } from 'src/company/enum/type.company.enum';

export class SearchDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsEnum(CompanyType)
  type?: CompanyType;
}
