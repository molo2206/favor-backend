import { IsEnum, IsOptional, IsString } from 'class-validator';
import { LeaveStatus } from '../../common/enums/leave-status.enum';

export class UpdateLeaveDto {
    @IsOptional() @IsEnum(LeaveStatus) status?: LeaveStatus;
    @IsOptional() @IsString() rejectionReason?: string;
}