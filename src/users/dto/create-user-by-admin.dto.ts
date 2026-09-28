import {
    IsEmail,
    IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString,
    MinLength,
} from 'class-validator';
import { UserRole } from '../enum/user-role-enum';
import { VehicleType } from '../enum/user-vehiculetype.enum';

export class CreateUserByAdminDto {
    @IsNotEmpty()
    @IsString()
    fullName: string;

    @IsOptional()
    @IsEmail()
    email?: string;

    @IsOptional()
    @IsString()
    phone?: string;

    @IsOptional()
    @IsString()
    @MinLength(6)
    password?: string;   // ⚠️ optionnel → un mot de passe par défaut sera utilisé

    @IsEnum(UserRole)
    role: UserRole;

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
    @IsEnum(VehicleType)
    vehicleType?: VehicleType;

    @IsOptional()
    @IsString()
    plateNumber?: string;
}