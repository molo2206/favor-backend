import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateDepartmentDto {
    @IsString()
    name: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsUUID()
    parentDepartmentId?: string;

    @IsOptional()
    @IsUUID()
    managerId?: string;

    @IsOptional()
    @IsUUID()
    companyId?: string;
}