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
    // ============================================================
    @Get()
    @UseGuards(AuthentificationGuard)            // ⬅️ guard ici
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