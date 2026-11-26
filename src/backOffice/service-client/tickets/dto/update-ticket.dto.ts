import { PartialType } from '@nestjs/mapped-types';
import { CreateTicketDto } from './create-ticket.dto';
import { IsEnum, IsOptional } from 'class-validator';
import { TicketStatus } from '../../common/enums/ticket-status.enum';

export class UpdateTicketDto extends PartialType(CreateTicketDto) {
    @IsOptional() @IsEnum(TicketStatus) status?: TicketStatus;
}