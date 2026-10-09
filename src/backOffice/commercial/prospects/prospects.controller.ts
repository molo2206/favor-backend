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
import { CreateProspectDto } from './dto/create-prospect.dto';
import { UpdateProspectDto } from './dto/update-prospect.dto';
import { QueryProspectDto } from './dto/query-prospect.dto';
import { ConvertProspectDto } from './dto/convert-prospect.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { ProspectsService } from './prospects.service';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { ProspectEntity } from './entities/prospect.entity';

@Controller('commercial/prospects')
@UseGuards(AuthentificationGuard)
export class ProspectsController {
    constructor(private readonly prospectsService: ProspectsService) { }

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
    // ➕ CRÉER UN PROSPECT
    // ============================================================
    @Post()
    @HttpCode(HttpStatus.CREATED)
    create(@Body() dto: CreateProspectDto, @Req() req: Request) {
        const lang = this.extractLanguage(req);
        return this.prospectsService.create(dto, lang);
    }

    // ============================================================
    // 📋 LISTER LES PROSPECTS
    // ============================================================
    @Get()
    async findAll(
        @Req() req: Request,
        @Query() query: QueryProspectDto,
    ): Promise<{
        message: string;
        data: PaginatedResponseDto<ProspectEntity>;
    }> {
        const lang = this.extractLanguage(req);
        return this.prospectsService.findAll(query, lang);
    }

    // ============================================================
    // 🔍 VOIR UN PROSPECT
    // ============================================================
    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
        const lang = this.extractLanguage(req);
        return this.prospectsService.findOne(id, lang);
    }

    // ============================================================
    // ✏️ MODIFIER UN PROSPECT
    // ============================================================
    @Patch(':id')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateProspectDto,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.prospectsService.update(id, dto, lang);
    }

    // ============================================================
    // 🔄 CONVERTIR UN PROSPECT EN CLIENT
    // ============================================================
    @Post(':id/convert')
    @HttpCode(HttpStatus.OK)
    convert(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: ConvertProspectDto,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.prospectsService.convertToCustomer(id, dto, lang);
    }

    // ============================================================
    // 🗑️ SUPPRIMER UN PROSPECT
    // ============================================================
    @Delete(':id')
    remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
        const lang = this.extractLanguage(req);
        return this.prospectsService.remove(id, lang);
    }
}