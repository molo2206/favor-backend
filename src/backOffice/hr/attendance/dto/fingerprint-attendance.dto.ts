import {
    IsDateString,
    IsEnum,
    IsOptional,
    IsString,
} from 'class-validator';
import { AttendanceStatus } from '../../common/enums/attendance-status.enum';

export class FingerprintAttendanceDto {
    /**
     * Empreinte digitale de l'employé
     * (obligatoire)
     */
    @IsString()
    fingerprint: string;

    /**
     * Date cible du pointage (YYYY-MM-DD)
     * Si non fournie → aujourd'hui
     */
    @IsOptional()
    @IsDateString()
    date?: string;

    /**
     * Timestamp précis du scan
     * Si non fourni → maintenant
     */
    @IsOptional()
    @IsDateString()
    timestamp?: string;

    /**
     * Statut de présence (uniquement pour CHECK-IN)
     */
    @IsOptional()
    @IsEnum(AttendanceStatus)
    status?: AttendanceStatus;

    /**
     * Notes libres
     */
    @IsOptional()
    @IsString()
    notes?: string;
}