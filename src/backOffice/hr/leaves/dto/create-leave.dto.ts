import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { LeaveType } from '../../common/enums/leave-type.enum';

export class CreateLeaveDto {
  @IsString() employeeId: string;
  @IsEnum(LeaveType) type: LeaveType;
  @IsDateString() startDate: string;
  @IsDateString() endDate: string;
  @Type(() => Number) @IsInt() @Min(1) days: number;
  @IsOptional() @IsString() reason?: string;
}