import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { TicketStatus } from '../../common/enums/ticket-status.enum';
import { TicketPriority } from '../../common/enums/ticket-priority.enum';
import { TicketCategory } from '../../common/enums/ticket-category.enum';
import { PeriodQueryDto, toBoolStr, toList } from '../../common/list-query';

export const TICKET_SORTS = ['createdAt', 'updatedAt', 'priority', 'status', 'slaDeadline', 'ticketNumber', 'resolvedAt'] as const;

/**
 * ✅ Filtres de la liste des tickets (tous facultatifs, combinables).
 * Plusieurs valeurs : status=NEW,ASSIGNED ou status=NEW&status=ASSIGNED
 */
export class TicketQueryDto extends PeriodQueryDto {
    @IsOptional() @Transform(toList) @IsArray() @ArrayMaxSize(10) @IsEnum(TicketStatus, { each: true }) status?: TicketStatus[];
    @IsOptional() @Transform(toList) @IsArray() @ArrayMaxSize(10) @IsEnum(TicketPriority, { each: true }) priority?: TicketPriority[];
    @IsOptional() @Transform(toList) @IsArray() @ArrayMaxSize(10) @IsEnum(TicketCategory, { each: true }) category?: TicketCategory[];
    @IsOptional() @IsUUID() customerId?: string;
    @IsOptional() @IsUUID() assignedToId?: string;
    /** true : tickets sans agent */
    @IsOptional() @Transform(toBoolStr) @IsIn(['true', 'false']) unassigned?: 'true' | 'false';
    @IsOptional() @IsUUID() orderId?: string;
    @IsOptional() @IsUUID() shipmentId?: string;
    /** true : SLA dépassé (marqué) */
    @IsOptional() @Transform(toBoolStr) @IsIn(['true', 'false']) slaBreached?: 'true' | 'false';
    /** true : échéance SLA passée et ticket encore ouvert */
    @IsOptional() @Transform(toBoolStr) @IsIn(['true', 'false']) overdue?: 'true' | 'false';
    /** true : ouverts (ni RESOLVED ni CLOSED) ; false : résolus / fermés */
    @IsOptional() @Transform(toBoolStr) @IsIn(['true', 'false']) open?: 'true' | 'false';
    /** true : sans première réponse */
    @IsOptional() @Transform(toBoolStr) @IsIn(['true', 'false']) noResponse?: 'true' | 'false';
    /** Résolu entre ces dates */
    @IsOptional() @IsDateString() resolvedFrom?: string;
    @IsOptional() @IsDateString() resolvedTo?: string;
    @IsOptional() @IsIn(TICKET_SORTS as unknown as string[]) sortBy?: (typeof TICKET_SORTS)[number];
}
