import {
  IsEmail,
  IsOptional,
  IsArray,
  ValidateNested,
  IsUUID,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ResourcePermissionDto } from './create-company-admin.dto';

export class AssignUserToCompanyDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ResourcePermissionDto)
  resources?: ResourcePermissionDto[];
}
