import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { ActivityType } from '../../common/enums/activity-type.enum';

export class CreateActivityDto {
    @IsEnum(ActivityType) type: ActivityType;
    @IsString() subject: string;
    @IsOptional() @IsString() description?: string;
    @IsOptional() @IsString() result?: string;
    @IsDateString() date: string;
    @IsOptional() @IsString() nextAction?: string;
    @IsOptional() @IsDateString() nextActionAt?: string;
    @IsString() salesRepId: string;
    @IsOptional() @IsString() prospectId?: string;
    @IsOptional() @IsString() customerId?: string;
}