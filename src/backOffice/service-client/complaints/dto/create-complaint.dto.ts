import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ComplaintLevel } from '../../common/enums/complaint-level.enum';

export class CreateComplaintDto {
    @IsString() subject: string;
    @IsString() description: string;
    @IsOptional() @IsEnum(ComplaintLevel) level?: ComplaintLevel;
    @IsOptional() @IsString() customerId?: string;
    @IsOptional() @IsString() agentId?: string;
    @IsOptional() attachments?: any;
}