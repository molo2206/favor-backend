// src/company/dto/update-company.dto.ts
import { IsOptional, IsString } from 'class-validator';

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
}

