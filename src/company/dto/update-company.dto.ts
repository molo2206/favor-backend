// src/company/dto/update-company.dto.ts
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

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
}

