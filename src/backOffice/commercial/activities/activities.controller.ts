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
import { ActivitiesService } from './activities.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { ActivityEntity } from './entities/activity.entity';

@Controller('commercial/activities')
@UseGuards(AuthentificationGuard)
export class ActivitiesController {
    constructor(private readonly activitiesService: ActivitiesService) { }

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
    // ➕ CRÉER UNE ACTIVITÉ
    // ============================================================
    @Post()
    @HttpCode(HttpStatus.CREATED)
    create(@Body() dto: CreateActivityDto, @Req() req: Request) {
        const lang = this.extractLanguage(req);
        return this.activitiesService.create(dto, lang);
    }

    // ============================================================
    // 📋 LISTER LES ACTIVITÉS
    // ============================================================
    @Get()
    async findAll(
        @Req() req: Request,
        @Query('salesRepId') salesRepId?: string,
        @Query('prospectId') prospectId?: string,
        @Query('customerId') customerId?: string,
        @Query('page') page: string = '1',
        @Query('limit') limit: string = '10',
    ): Promise<{
        message: string;
        data: PaginatedResponseDto<ActivityEntity>;
    }> {
        const lang = this.extractLanguage(req);
        return this.activitiesService.findAll(
            salesRepId,
            prospectId,
            customerId,
            Number(page),
            Number(limit),
            lang,
        );
    }

    // ============================================================
    // 🔍 VOIR UNE ACTIVITÉ
    // ============================================================
    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
        const lang = this.extractLanguage(req);
        return this.activitiesService.findOne(id, lang);
    }

    // ============================================================
    // ✏️ MODIFIER UNE ACTIVITÉ
    // ============================================================
    @Patch(':id')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateActivityDto,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.activitiesService.update(id, dto, lang);
    }

    // ============================================================
    // 🗑️ SUPPRIMER UNE ACTIVITÉ
    // ============================================================
    @Delete(':id')
    remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
        const lang = this.extractLanguage(req);
        return this.activitiesService.remove(id, lang);
    }
}