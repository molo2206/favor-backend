import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    Patch,
    Query,
    Req,
    UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { SlaService } from './sla.service';
import { TicketPriority } from '../common/enums/ticket-priority.enum';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { SlaQueryDto } from './dto/sla-query.dto';

@Controller('service-client/sla')
@UseGuards(AuthentificationGuard)
export class SlaController {
    constructor(private readonly slaService: SlaService) { }

    // ============================================================
    // 🌍 EXTRACTION DE LA LANGUE
    // ============================================================
    private extractLanguage(req: Request): string {
        const acceptLanguage = req.headers['accept-language'];
        if (!acceptLanguage) return 'fr';
        const primary = acceptLanguage.split(',')[0].split(';')[0].trim();
        const supported = ['fr', 'en', 'sw', 'es', 'ar'];
        return supported.includes(primary) ? primary : 'fr';
    }

    // ============================================================
    // 📋 LISTER TOUS LES SLA
    // ============================================================
    /** Filtres : priority (plusieurs valeurs : A,B), sortBy, sortOrder, page, limit */
    @Get()
    findAll(@Req() req: Request, @Query() q: SlaQueryDto) {
        const lang = this.extractLanguage(req);
        return this.slaService.findAll(q, lang);
    }

    // ============================================================
    // 🔍 VOIR UN SLA PAR PRIORITÉ
    // ============================================================
    @Get(':priority')
    findByPriority(
        @Param('priority') priority: TicketPriority,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.slaService.findByPriority(priority, lang);
    }

    // ============================================================
    // ⬆️ CRÉER OU METTRE À JOUR UN SLA
    // ============================================================
    @Patch()
    @HttpCode(HttpStatus.OK)
    upsert(
        @Body('priority') priority: TicketPriority,
        @Body('firstResponseMinutes') firstResponseMinutes: number,
        @Body('resolutionMinutes') resolutionMinutes: number,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.slaService.upsert(
            priority,
            Number(firstResponseMinutes),
            Number(resolutionMinutes),
            lang,
        );
    }

    // ============================================================
    // 🗑️ SUPPRIMER UN SLA
    // ============================================================
    @Delete(':priority')
    remove(
        @Param('priority') priority: TicketPriority,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.slaService.remove(priority, lang);
    }
}