import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ProspectStatus } from '../../common/enums/prospect-status.enum';

export class QueryProspectDto {
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number = 20;
    @IsOptional() @IsEnum(ProspectStatus) status?: ProspectStatus;
    @IsOptional() @IsString() assignedToId?: string;
    @IsOptional() @IsString() companyId?: string;
    @IsOptional() @IsString() search?: string;
}