import {
    IsDateString,
    IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString,
} from 'class-validator';
import { ActivityType } from '../../common/enums/activity-type.enum';

export class CreateActivityDto {
    @IsEnum(ActivityType)
    type: ActivityType;

    @IsString()
    @IsNotEmpty()
    subject: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsString()
    result?: string;

    @IsDateString()
    date: string;

    @IsOptional()
    @IsString()
    nextAction?: string;

    @IsOptional()
    @IsDateString()
    nextActionAt?: string;

    @IsOptional()
    @IsString()
    salesRepId?: string;

    @IsOptional()
    @IsString()
    prospectId?: string;

    // ✅ Le client = users.id
    @IsOptional()
    @IsString()
    customerId?: string;
}