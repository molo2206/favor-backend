import {
    IsInt,
    IsNumber,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class QuotationItemDto {
    @IsString()
    description: string;

    @Type(() => Number)
    @IsInt()
    @Min(1)
    quantity: number;

    @Type(() => Number)
    @IsNumber()
    @Min(0)
    unitPrice: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    discountRate?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    taxRate?: number;

    @IsOptional()
    @IsString()
    productId?: string;
}