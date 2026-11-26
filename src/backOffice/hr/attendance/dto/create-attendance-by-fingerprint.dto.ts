import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { AttendanceStatus } from '../../common/enums/attendance-status.enum';

export class CheckInByFingerprintDto {
    @IsString()
    fingerprint: string;          // ✅ Empreinte digitale

    @IsOptional()
    @IsDateString()
    date?: string;                // Si non fourni → aujourd'hui

    @IsOptional()
    @IsDateString()
    checkInAt?: string;

    @IsOptional()
    @IsEnum(AttendanceStatus)
    status?: AttendanceStatus;

    @IsOptional()
    @IsString()
    notes?: string;
}