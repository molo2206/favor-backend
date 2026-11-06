import { IsArray, IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreatePayrollRunDto {
  @IsString()
  period: string; // '2026-10'

  @IsDateString()
  periodStart: string;

  @IsDateString()
  periodEnd: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  employeeIds?: string[];

  @IsOptional()
  @IsString()
  notes?: string;
}