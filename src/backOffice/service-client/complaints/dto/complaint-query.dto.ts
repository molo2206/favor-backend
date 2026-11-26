import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { ComplaintStatus } from '../entities/complaint.entity';
import { ComplaintLevel } from '../../common/enums/complaint-level.enum';
import { PeriodQueryDto, toBoolStr, toList } from '../../common/list-query';

export const COMPLAINT_SORTS = ['createdAt', 'updatedAt', 'level', 'status', 'number'] as const;

/**
 * ✅ Filtres de la liste des réclamations (tous facultatifs, combinables).
 * Plusieurs valeurs : status=OPEN,IN_PROGRESS ; level=URGENT,CRITICAL
 */
export class ComplaintQueryDto extends PeriodQueryDto {
    @IsOptional() @Transform(toList) @IsArray() @ArrayMaxSize(10) @IsEnum(ComplaintStatus, { each: true }) status?: ComplaintStatus[];
    @IsOptional() @Transform(toList) @IsArray() @ArrayMaxSize(10) @IsEnum(ComplaintLevel, { each: true }) level?: ComplaintLevel[];
    @IsOptional() @IsUUID() customerId?: string;
    @IsOptional() @IsUUID() agentId?: string;
    /** true : réclamations sans agent */
    @IsOptional() @Transform(toBoolStr) @IsIn(['true', 'false']) unassigned?: 'true' | 'false';
    /** true : ouvertes (OPEN, IN_PROGRESS) ; false : résolues / fermées */
    @IsOptional() @Transform(toBoolStr) @IsIn(['true', 'false']) open?: 'true' | 'false';
    /** true : avec action corrective renseignée ; false : sans */
    @IsOptional() @Transform(toBoolStr) @IsIn(['true', 'false']) hasCorrectiveAction?: 'true' | 'false';
    /** true : avec pièces jointes */
    @IsOptional() @Transform(toBoolStr) @IsIn(['true', 'false']) hasAttachments?: 'true' | 'false';
    @IsOptional() @IsIn(COMPLAINT_SORTS as unknown as string[]) sortBy?: (typeof COMPLAINT_SORTS)[number];
}
