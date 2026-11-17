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
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { TicketQueryDto } from './dto/ticket-query.dto';
import { UserEntity } from 'src/users/entities/user.entity';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';

@Controller('service-client/tickets')
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
    // ➕ CRÉER UN TICKET (protégé — besoin du user connecté)
    // ============================================================
    @Post()
    @UseGuards(AuthentificationGuard)            // ⬅️ guard ici
    @HttpCode(HttpStatus.CREATED)
    create(
        @Body() dto: CreateTicketDto,
        @CurrentUser() user: UserEntity,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.ticketsService.create(dto, user, lang);
    }

    // ============================================================
    // 📋 LISTER LES TICKETS (protégé)
    // Filtres : search, status, priority, category (plusieurs valeurs : A,B), customerId, assignedToId,
    // unassigned, orderId, shipmentId, slaBreached, overdue, open, noResponse, from, to, resolvedFrom,
    // resolvedTo, sortBy, sortOrder, page, limit
    // ============================================================
    @Get()
    @UseGuards(AuthentificationGuard)            // ⬅️ guard ici
    async findAll(@Req() req: Request, @Query() q: TicketQueryDto) {
        const lang = this.extractLanguage(req);
        return this.ticketsService.findAll(q, lang);
    }

    // ============================================================
    // 👤 MES TICKETS (client connecté) — mêmes filtres
    // ============================================================
    @Get('me')
    @UseGuards(AuthentificationGuard)
    async findMine(@Req() req: Request, @CurrentUser() user: UserEntity, @Query() q: TicketQueryDto) {
        const lang = this.extractLanguage(req);
        return this.ticketsService.findMine(user.id, q, lang);
    }

    // ============================================================
    // 🔍 VOIR UN TICKET (protégé)
    // ============================================================
    @Get(':id')
    @UseGuards(AuthentificationGuard)            // ⬅️ guard ici
    findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
        const lang = this.extractLanguage(req);
        return this.ticketsService.findOne(id, lang);
    }

    // ============================================================
    // ✏️ MODIFIER UN TICKET (protégé)
    // ============================================================
    @Patch(':id')
    @UseGuards(AuthentificationGuard)            // ⬅️ guard ici
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateTicketDto,
        @CurrentUser() user: UserEntity,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.ticketsService.update(id, dto, user, lang);
    }

    // ============================================================
    // 👤 ASSIGNER UN TICKET (protégé)
    // ============================================================
    @Patch(':id/assign')
    @UseGuards(AuthentificationGuard)            // ⬅️ guard ici
    assign(
        @Param('id', ParseUUIDPipe) id: string,
        @Body('assignedToId', ParseUUIDPipe) assignedToId: string,
        @CurrentUser() user: UserEntity,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.ticketsService.assign(id, assignedToId, user, lang);
    }

    // ============================================================
    // 🗑️ SUPPRIMER UN TICKET (protégé)
    // ============================================================
    @Delete(':id')
    @UseGuards(AuthentificationGuard)            // ⬅️ guard ici
    remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
        const lang = this.extractLanguage(req);
        return this.ticketsService.remove(id, lang);
    }
}