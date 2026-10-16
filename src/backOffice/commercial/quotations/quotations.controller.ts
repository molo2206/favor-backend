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
import { QuotationsService } from './quotations.service';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { UpdateQuotationDto } from './dto/update-quotation.dto';
import { QuotationStatus } from '../common/enums/quotation-status.enum';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';

@Controller('commercial/quotations')
@UseGuards(AuthentificationGuard)
export class QuotationsController {
    constructor(private readonly quotationsService: QuotationsService) { }

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
    // ➕ CRÉER UN DEVIS
    // ============================================================
    @Post()
    @HttpCode(HttpStatus.CREATED)
    create(@Body() dto: CreateQuotationDto, @Req() req: Request) {
        const lang = this.extractLanguage(req);
        return this.quotationsService.create(dto, lang);
    }

    // ============================================================
    // 📋 LISTER LES DEVIS
    // ============================================================
    @Get()
    async findAll(
        @Req() req: Request,
        @Query('status') status?: QuotationStatus,
        @Query('customerId') customerId?: string,
        @Query('salesRepId') salesRepId?: string,
        @Query('page') page: string = '1',
        @Query('limit') limit: string = '10',
    ) {
        const lang = this.extractLanguage(req);
        return this.quotationsService.findAll(
            {
                status,
                customerId,
                salesRepId,
                page: Number(page),
                limit: Number(limit),
            },
            lang,
        );
    }

    // ============================================================
    // 🔍 VOIR UN DEVIS
    // ============================================================
    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
        const lang = this.extractLanguage(req);
        return this.quotationsService.findOne(id, lang);
    }

    // ============================================================
    // ✏️ MODIFIER UN DEVIS
    // ============================================================
    @Patch(':id')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateQuotationDto,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.quotationsService.update(id, dto, lang);
    }

    // ============================================================
    // 🔄 CHANGER LE STATUT
    // ============================================================
    @Patch(':id/status')
    updateStatus(
        @Param('id', ParseUUIDPipe) id: string,
        @Body('status') status: QuotationStatus,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.quotationsService.updateStatus(id, status, lang);
    }

    // ============================================================
    // 🗑️ SUPPRIMER UN DEVIS
    // ============================================================
    @Delete(':id')
    remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
        const lang = this.extractLanguage(req);
        return this.quotationsService.remove(id, lang);
    }
}