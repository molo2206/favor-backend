import {
    IsArray, IsNumber, IsOptional, IsString, ValidateNested, IsDateString, IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { QuotationStatus } from '../../common/enums/quotation-status.enum';

export class QuotationItemDto {
    @IsString() description: string;
    @Type(() => Number) @IsNumber() quantity: number;
    @Type(() => Number) @IsNumber() unitPrice: number;
    @IsOptional() @IsString() productId?: string;
}

export class CreateQuotationDto {
    @IsOptional() @IsString() customerId?: string;
    @IsOptional() @IsString() salesRepId?: string;
    @IsOptional() @IsString() currency?: string;
    @IsOptional() @Type(() => Number) @IsNumber() discountRate?: number;
    @IsOptional() @Type(() => Number) @IsNumber() taxRate?: number;
    @IsOptional() @IsDateString() validUntil?: string;
    @IsOptional() @IsString() paymentTerms?: string;
    @IsOptional() @IsEnum(QuotationStatus) status?: QuotationStatus;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => QuotationItemDto)
    items: QuotationItemDto[];
}