import { IsDateString, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { EmployeeStatus } from '../../common/enums/employee-status.enum';

export class CreateEmployeeDto {
    @IsString() fullName: string;
    @IsOptional() @IsString() email?: string;
    @IsOptional() @IsString() phone?: string;
    @IsOptional() @IsString() address?: string;
    @IsOptional() @IsString() position?: string;
    @IsOptional() @IsDateString() hireDate?: string;
    @IsOptional() @IsEnum(EmployeeStatus) status?: EmployeeStatus;
    @IsOptional() @Type(() => Number) @IsNumber() baseSalary?: number;
    @IsOptional() @IsString() currency?: string;
    @IsOptional() @IsString() image?: string;
    @IsOptional() @IsString() userId?: string;
    @IsOptional() @IsString() departmentId?: string;
    @IsOptional() @IsString() companyId?: string;
    @IsOptional() @IsString() branchId?: string;
}