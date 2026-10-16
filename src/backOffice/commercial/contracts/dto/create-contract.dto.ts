import { IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ContractStatus } from '../../common/enums/contract-status.enum';

export class CreateContractDto {
    @IsString() type: string;
    @IsOptional() @IsEnum(ContractStatus) status?: ContractStatus;
    @IsDateString() startDate: string;
    @IsOptional() @IsDateString() endDate?: string;
    @IsOptional() @Type(() => Number) @IsNumber() amount?: number;
    @IsOptional() @IsString() currency?: string;
    @IsOptional() @IsString() terms?: string;
    @IsOptional() @IsString() documentUrl?: string;
    @IsOptional() @IsString() customerId?: string;
    @IsOptional() @IsString() managerId?: string;
    @IsOptional() @IsBoolean() autoRenew?: boolean;
}