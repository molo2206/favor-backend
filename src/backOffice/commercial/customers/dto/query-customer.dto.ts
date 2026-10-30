import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CustomerStatus, CustomerType } from '../../common/enums/customer.enum';

export class QueryCustomerDto {
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number = 20;
    @IsOptional() @IsEnum(CustomerStatus) status?: CustomerStatus;
    @IsOptional() @IsEnum(CustomerType) type?: CustomerType;
    @IsOptional() @IsString() commercialManagerId?: string;
    @IsOptional() @IsString() companyId?: string;
    @IsOptional() @IsString() search?: string;
}