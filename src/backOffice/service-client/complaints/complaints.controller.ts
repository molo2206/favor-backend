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
import { ComplaintsService } from './complaints.service';
import { CreateComplaintDto } from './dto/create-complaint.dto';
import { UpdateComplaintDto } from './dto/update-complaint.dto';
import { ComplaintStatus } from './entities/complaint.entity';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { ComplaintEntity } from './entities/complaint.entity';

@Controller('service-client/complaints')
@UseGuards(AuthentificationGuard)
export class ComplaintsController {
    constructor(private readonly complaintsService: ComplaintsService) { }

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
    // ➕ CRÉER UNE RÉCLAMATION
    // ============================================================
    @Post()
    @HttpCode(HttpStatus.CREATED)
    create(@Body() dto: CreateComplaintDto, @Req() req: Request) {
        const lang = this.extractLanguage(req);
        return this.complaintsService.create(dto, lang);
    }

    // ============================================================
    // 📋 LISTER LES RÉCLAMATIONS
    // ============================================================
    @Get()
    async findAll(
        @Req() req: Request,
        @Query('status') status?: ComplaintStatus,
        @Query('level') level?: string,
        @Query('customerId') customerId?: string,
        @Query('agentId') agentId?: string,
        @Query('page') page: string = '1',
        @Query('limit') limit: string = '10',
    ): Promise<{
        message: string;
        data: PaginatedResponseDto<ComplaintEntity>;
    }> {
        const lang = this.extractLanguage(req);
        return this.complaintsService.findAll(
            status,
            level,
            customerId,
            agentId,
            Number(page),
            Number(limit),
            lang,
        );
    }

    // ============================================================
    // 🔍 VOIR UNE RÉCLAMATION
    // ============================================================
    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
        const lang = this.extractLanguage(req);
        return this.complaintsService.findOne(id, lang);
    }

    // ============================================================
    // ✏️ MODIFIER UNE RÉCLAMATION
    // ============================================================
    @Patch(':id')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateComplaintDto,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.complaintsService.update(id, dto, lang);
    }

    // ============================================================
    // 👤 ASSIGNER UNE RÉCLAMATION
    // ============================================================
    @Patch(':id/assign')
    assign(
        @Param('id', ParseUUIDPipe) id: string,
        @Body('agentId', ParseUUIDPipe) agentId: string,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.complaintsService.assign(id, agentId, lang);
    }

    // ============================================================
    // 🗑️ SUPPRIMER UNE RÉCLAMATION
    // ============================================================
    @Delete(':id')
    remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
        const lang = this.extractLanguage(req);
        return this.complaintsService.remove(id, lang);
    }
}