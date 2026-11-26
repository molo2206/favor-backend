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
import { OpportunitiesService } from './opportunities.service';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { OpportunityStage } from '../common/enums/opportunity-stage.enum';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { OpportunityEntity } from './entities/opportunity.entity';

@Controller('commercial/opportunities')
@UseGuards(AuthentificationGuard)
export class OpportunitiesController {
    constructor(private readonly opportunitiesService: OpportunitiesService) { }

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
    // ➕ CRÉER UNE OPPORTUNITÉ
    // ============================================================
    @Post()
    @HttpCode(HttpStatus.CREATED)
    create(@Body() dto: CreateOpportunityDto, @Req() req: Request) {
        const lang = this.extractLanguage(req);
        return this.opportunitiesService.create(dto, lang);
    }

    // ============================================================
    // 📋 LISTER LES OPPORTUNITÉS
    // ============================================================
    @Get()
    async findAll(
        @Req() req: Request,
        @Query('stage') stage?: OpportunityStage,
        @Query('assignedToId') assignedToId?: string,
        @Query('customerId') customerId?: string,
        @Query('prospectId') prospectId?: string,
        @Query('page') page: string = '1',
        @Query('limit') limit: string = '10',
    ): Promise<{
        message: string;
        data: PaginatedResponseDto<OpportunityEntity>;
    }> {
        const lang = this.extractLanguage(req);
        return this.opportunitiesService.findAll(
            stage,
            assignedToId,
            customerId,
            prospectId,
            Number(page),
            Number(limit),
            lang,
        );
    }

    // ============================================================
    // 📊 PIPELINE (vue groupée par stage)
    // ============================================================
    @Get('pipeline')
    pipeline(
        @Req() req: Request,
        @Query('assignedToId') assignedToId?: string,
    ) {
        const lang = this.extractLanguage(req);
        return this.opportunitiesService.getPipeline(assignedToId, lang);
    }

    // ============================================================
    // 🔍 VOIR UNE OPPORTUNITÉ
    // ============================================================
    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
        const lang = this.extractLanguage(req);
        return this.opportunitiesService.findOne(id, lang);
    }

    // ============================================================
    // ✏️ MODIFIER UNE OPPORTUNITÉ
    // ============================================================
    @Patch(':id')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateOpportunityDto,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.opportunitiesService.update(id, dto, lang);
    }

    // ============================================================
    // 🔄 CHANGER L'ÉTAPE (STAGE)
    // ============================================================
    @Patch(':id/stage')
    updateStage(
        @Param('id', ParseUUIDPipe) id: string,
        @Body('stage') stage: OpportunityStage,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.opportunitiesService.updateStage(id, stage, lang);
    }

    // ============================================================
    // 🗑️ SUPPRIMER UNE OPPORTUNITÉ
    // ============================================================
    @Delete(':id')
    remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
        const lang = this.extractLanguage(req);
        return this.opportunitiesService.remove(id, lang);
    }
}