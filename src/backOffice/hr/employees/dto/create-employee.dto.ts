import {
    IsDateString,
    IsEmail,
    IsEnum,
    IsNumber,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
    Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { EmployeeStatus } from '../../common/enums/employee-status.enum';

export class CreateEmployeeDto {
    @IsString()
    @MaxLength(200)
    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    fullName: string;

    @IsOptional()
    @IsEmail()
    @Transform(({ value }) =>
        typeof value === 'string' ? value.toLowerCase().trim() : value,
    )
    email?: string;

    @IsOptional()
    @IsString()
    @MaxLength(30)
    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    phone?: string;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    address?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    position?: string;

    @IsOptional()
    @IsDateString()
    hireDate?: string;

    @IsOptional()
    @IsEnum(EmployeeStatus)
    status?: EmployeeStatus;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    baseSalary?: number;

    @IsOptional()
    @IsString()
    @MaxLength(10)
    currency?: string;

    @IsOptional()
    @IsString()
    image?: string;

    @IsOptional()
    @IsUUID()
    userId?: string;

    @IsOptional()
    @IsUUID()
    departmentId?: string;

    @IsOptional()
    @IsUUID()
    companyId?: string;

    @IsOptional()
    @IsUUID()
    branchId?: string;
}