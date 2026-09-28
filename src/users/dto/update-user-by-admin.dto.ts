import {
    IsBoolean,
    IsEmail,
    IsEnum,
    IsOptional,
    IsString,
    MinLength,
} from 'class-validator';
import { UserRole } from '../enum/user-role-enum';
import { VehicleType } from '../enum/user-vehiculetype.enum';

export class UpdateUserByAdminDto {
    @IsOptional()
    @IsString()
    fullName?: string;

    @IsOptional()
    @IsEmail()
    email?: string;

    @IsOptional()
    @IsString()
    phone?: string;

    @IsOptional()
    @IsString()
    @MinLength(6)
    password?: string;

    @IsOptional()
    @IsString()
    country?: string;

    @IsOptional()
    @IsString()
    city?: string;

    @IsOptional()
    @IsString()
    address?: string;

    @IsOptional()
    @IsString()
    image?: string;

    @IsOptional()
    @IsString()
    preferredLanguage?: string;

    @IsOptional()
    @IsEnum(UserRole)
    role?: UserRole;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @IsOptional()
    @IsEnum(VehicleType)
    vehicleType?: VehicleType;

    @IsOptional()
    @IsString()
    plateNumber?: string;

    @IsOptional()
    @IsString()
    licenseDocumentUrl?: string;
}