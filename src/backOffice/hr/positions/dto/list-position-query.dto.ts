import { IsOptional, IsEnum, IsUUID, IsInt, Min, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { PositionStatus } from '../entities/position.entity';

export class ListPositionQueryDto {
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
    @IsEnum(PositionStatus)
    status?: PositionStatus;

    @IsOptional()
    @IsUUID()
    companyId?: string;

    @IsOptional()
    @IsUUID()
    departmentId?: string;

    @IsOptional()
    @IsString()
    search?: string;
}