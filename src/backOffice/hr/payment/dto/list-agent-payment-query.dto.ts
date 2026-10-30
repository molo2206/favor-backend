import {
    IsOptional,
    IsEnum,
    IsUUID,
    IsInt,
    Min,
    IsString,
    IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentStatus } from '../enums/payment-status.enum';
import { PaymentMethod } from '../enums/payment-method.enum';
import { PaymentType } from '../enums/payment-type.enum';

export class ListAgentPaymentQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number = 1;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    limit?: number = 10;

    @IsOptional()
    @IsUUID()
    employeeId?: string;

    @IsOptional()
    @IsUUID()
    companyId?: string;

    @IsOptional()
    @IsUUID()
    branchId?: string;

    @IsOptional()
    @IsEnum(PaymentType)
    type?: PaymentType; // ✅ NOUVEAU

    @IsOptional()
    @IsEnum(PaymentStatus)
    status?: PaymentStatus;

    @IsOptional()
    @IsEnum(PaymentMethod)
    method?: PaymentMethod;

    @IsOptional()
    @IsString()
    period?: string;

    @IsOptional()
    @IsDateString()
    startDate?: string;

    @IsOptional()
    @IsDateString()
    endDate?: string;

    @IsOptional()
    @IsString()
    search?: string;

    @IsOptional()
    @IsDateString()
    paidFrom?: string;

    @IsOptional()
    @IsDateString()
    paidTo?: string;

    @IsOptional()
    @IsDateString()
    periodFrom?: string;

    @IsOptional()
    @IsDateString()
    periodTo?: string;
}