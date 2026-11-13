import { IsEnum, IsOptional, IsString } from 'class-validator';
import { TicketCategory } from '../../common/enums/ticket-category.enum';
import { TicketPriority } from '../../common/enums/ticket-priority.enum';

export class CreateTicketDto {
    @IsString() subject: string;
    @IsOptional() @IsString() description?: string;
    @IsOptional() @IsEnum(TicketPriority) priority?: TicketPriority;
    @IsOptional() @IsEnum(TicketCategory) category?: TicketCategory;
    @IsOptional() @IsString() customerId?: string;
    @IsOptional() @IsString() assignedToId?: string;
    @IsOptional() @IsString() orderId?: string;
    @IsOptional() @IsString() shipmentId?: string;
}