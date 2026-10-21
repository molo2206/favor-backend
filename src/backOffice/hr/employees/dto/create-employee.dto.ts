import {
    IsEmail,
    IsOptional,
    IsString,
    IsUUID,
    IsDateString,
    IsEnum,
} from 'class-validator';
import { EmployeeStatus } from '../../common/enums/employee-status.enum';

export class CreateEmployeeDto {
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
    address?: string;

    @IsOptional()
    @IsString()
    position?: string;

    @IsOptional()
    @IsDateString()
    hireDate?: string;

    @IsOptional()
    @IsEnum(EmployeeStatus)
    status?: EmployeeStatus;

    @IsOptional()
    baseSalary?: number;

    @IsOptional()
    @IsString()
    currency?: string;

    @IsOptional()
    @IsUUID()
    departmentId?: string;

    @IsOptional()
    @IsUUID()
    branchId?: string;

    @IsOptional()
    @IsUUID()
    userId?: string;

    // ✅ AJOUT : URL de l'image (optionnelle)
    //    → généralement fournie par un upload préalable
    @IsOptional()
    @IsString()
    image?: string;

    // ✅ AJOUT : empreinte digitale (optionnelle)
    @IsOptional()
    @IsString()
    fingerprint?: string;
}