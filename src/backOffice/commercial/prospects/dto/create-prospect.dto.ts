import {
    IsEmail, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProspectStatus } from '../../common/enums/prospect-status.enum';

export class CreateProspectDto {
    @IsString() fullName: string;
    @IsOptional() @IsString() companyName?: string;
    @IsOptional() @IsEmail() email?: string;
    @IsOptional() @IsString() phone?: string;
    @IsOptional() @IsString() address?: string;
    @IsOptional() @IsString() sector?: string;
    @IsOptional() @IsString() source?: string;
    @IsOptional() @IsString() identifiedNeed?: string;
    @IsOptional() @IsString() productInterest?: string;
    @IsOptional() @Type(() => Number) @IsNumber() estimatedBudget?: number;
    @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) conversionProbability?: number;
    @IsOptional() @IsEnum(ProspectStatus) status?: ProspectStatus;
    @IsOptional() @IsString() assignedToId?: string;
    @IsOptional() @IsString() companyId?: string;
    @IsOptional() @IsString() branchId?: string;
}