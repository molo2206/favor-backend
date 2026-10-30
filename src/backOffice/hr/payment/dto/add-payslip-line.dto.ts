import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PayslipLineType } from '../enums/payslip-line-type.enum';

export class AddPayslipLineDto {
    @IsEnum(PayslipLineType)
    type: PayslipLineType;

    @IsString()
    code: string;

    @IsString()
    label: string;

    @Type(() => Number)
    @IsNumber()
    @Min(0)
    amount: number;

    @IsOptional()
    @IsString()
    notes?: string;
}