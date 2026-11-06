// src/company/dto/create-company-settings.dto.ts

import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateCompanySettingsDto {
    @IsUUID()
    @IsString()
    companyId: string;

    @IsOptional()
    @IsBoolean()
    enableLoyaltyFees?: boolean;

    @IsOptional()
    @IsNumber()
    @Min(0)
    loyaltyFeeFixed?: number;
}

export class UpdateCompanySettingsDto extends PartialType(CreateCompanySettingsDto) { }