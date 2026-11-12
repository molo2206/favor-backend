import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { CustomerStatus, CustomerType } from '../../common/enums/customer.enum';

export class CreateCustomerDto {
  @IsString() fullName: string;
  @IsOptional() @IsString() companyName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() sector?: string;
  @IsOptional() @IsEnum(CustomerType) type?: CustomerType;
  @IsOptional() @IsEnum(CustomerStatus) status?: CustomerStatus;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() commercialManagerId?: string;
  @IsOptional() @IsString() companyId?: string;
  @IsOptional() @IsString() branchId?: string;
}