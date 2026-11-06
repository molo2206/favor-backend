import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { QuotationStatus } from '../../common/enums/quotation-status.enum';

export class QueryQuotationDto {
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
    @IsEnum(QuotationStatus)
    status?: QuotationStatus;

    @IsOptional()
    @IsString()
    customerId?: string;

    @IsOptional()
    @IsString()
    salesRepId?: string;

    @IsOptional()
    @IsString()
    search?: string;
}