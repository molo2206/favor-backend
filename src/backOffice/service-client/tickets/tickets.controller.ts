import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Query,
    Req,
    UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { TicketEntity } from './entities/ticket.entity';

@Controller('service-client/tickets')
@UseGuards(AuthentificationGuard)
export class TicketsController {
    constructor(private readonly ticketsService: TicketsService) { }

    private extractLanguage(req: Request): string {
        const acceptLanguage = req.headers['accept-language'];
        if (!acceptLanguage) return 'fr';
        const primary = acceptLanguage.split(',')[0].split(';')[0].trim();
        const supported = ['fr', 'en', 'sw', 'es', 'ar'];
        return supported.includes(primary) ? primary : 'fr';
    }

    // ============================================================
    // ➕ CRÉER UN TICKET
    // ============================================================
    @Post()
    @HttpCode(HttpStatus.CREATED)
    create(@Body() dto: CreateTicketDto, @Req() req: Request) {
        const lang = this.extractLanguage(req);
        return this.ticketsService.create(dto, lang);
    }

    // ============================================================
    // 📋 LISTER LES TICKETS
    // ============================================================
    @Get()
    async findAll(
        @Req() req: Request,
        @Query('status') status?: TicketStatus,
        @Query('priority') priority?: string,
        @Query('category') category?: string,
        @Query('customerId') customerId?: string,
        @Query('assignedToId') assignedToId?: string,
        @Query('page') page: string = '1',
        @Query('limit') limit: string = '10',
    ): Promise<{
        message: string;
        data: PaginatedResponseDto<TicketEntity>;
    }> {
        const lang = this.extractLanguage(req);
        return this.ticketsService.findAll(
            status,
            priority,
            category,
            customerId,
            assignedToId,
            Number(page),
            Number(limit),
            lang,
        );
    }

    // ============================================================
    // 🔍 VOIR UN TICKET
    // ============================================================
    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
        const lang = this.extractLanguage(req);
        return this.ticketsService.findOne(id, lang);
    }

    // ============================================================
    // ✏️ MODIFIER UN TICKET
    // ============================================================
    @Patch(':id')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateTicketDto,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.ticketsService.update(id, dto, lang);
    }

    // ============================================================
    // 👤 ASSIGNER UN TICKET
    // ============================================================
    @Patch(':id/assign')
    assign(
        @Param('id', ParseUUIDPipe) id: string,
        @Body('assignedToId', ParseUUIDPipe) assignedToId: string,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.ticketsService.assign(id, assignedToId, lang);
    }

    // ============================================================
    // 🗑️ SUPPRIMER UN TICKET
    // ============================================================
    @Delete(':id')
    remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
        const lang = this.extractLanguage(req);
        return this.ticketsService.remove(id, lang);
    }
}