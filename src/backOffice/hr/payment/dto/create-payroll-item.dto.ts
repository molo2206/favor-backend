import {
  IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PayslipLineType } from '../enums/payslip-line-type.enum';
import { PayrollItemCalculation } from '../enums/payroll-item-calculation.enum';

export class CreatePayrollItemDto {
  @IsString()
  code: string;

  @IsString()
  label: string;

  @IsEnum(PayslipLineType)
  type: PayslipLineType;

  @IsEnum(PayrollItemCalculation)
  calculation: PayrollItemCalculation;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  value: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isMandatory?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  order?: number;

  @IsOptional()
  @IsString()
  description?: string;
}