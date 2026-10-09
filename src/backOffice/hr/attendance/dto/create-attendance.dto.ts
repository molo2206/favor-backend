import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { AttendanceStatus } from '../../common/enums/attendance-status.enum';

export class CreateAttendanceDto {
    @IsString() employeeId: string;
    @IsDateString() date: string;
    @IsOptional() @IsDateString() checkInAt?: string;
    @IsOptional() @IsDateString() checkOutAt?: string;
    @IsOptional() @IsEnum(AttendanceStatus) status?: AttendanceStatus;
    @IsOptional() @IsString() notes?: string;
}