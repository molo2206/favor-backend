import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsIn, IsOptional } from 'class-validator';
import { TicketPriority } from '../../common/enums/ticket-priority.enum';
import { PageQueryDto, toList } from '../../common/list-query';

/** ✅ Liste des SLA : filtre par priorité + pagination */
export class SlaQueryDto extends PageQueryDto {
    @IsOptional() @Transform(toList) @IsArray() @ArrayMaxSize(10) @IsEnum(TicketPriority, { each: true }) priority?: TicketPriority[];
    @IsOptional() @IsIn(['priority', 'firstResponseMinutes', 'resolutionMinutes', 'updatedAt']) sortBy?: string;
}
