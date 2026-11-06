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
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { ComplaintQueryDto } from './dto/complaint-query.dto';
import { UserEntity } from 'src/users/entities/user.entity';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { AuditAction } from 'src/audit/decorator/audit.decorator';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';

@Controller('service-client/complaints')
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
    @UseGuards(AuthentificationGuard)
    @AuditAction(ActionType.CREATE, 'Complaint')
    async create(
        @Body() dto: CreateComplaintDto,
        @CurrentUser() user: UserEntity,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.complaintsService.create(dto, lang, user?.id ?? null);
    }

    // ============================================================
    // 👤 MES RÉCLAMATIONS (user connecté) — mêmes filtres que la liste
    // ============================================================
    @Get('me')
    @UseGuards(AuthentificationGuard)
    async findMyComplaints(@CurrentUser() user: UserEntity, @Req() req: Request, @Query() q: ComplaintQueryDto) {
        const lang = this.extractLanguage(req);
        return this.complaintsService.findMyComplaints(user.id, q, lang);
    }

    // ============================================================
    // 📋 LISTER LES RÉCLAMATIONS
    // Filtres : search, status, level (plusieurs valeurs : A,B), customerId, agentId, unassigned, open,
    // hasCorrectiveAction, hasAttachments, from, to, sortBy, sortOrder, page, limit
    // ============================================================
    @Get()
    @UseGuards(AuthentificationGuard)
    async findAll(@Req() req: Request, @Query() q: ComplaintQueryDto) {
        const lang = this.extractLanguage(req);
        return this.complaintsService.findAll(q, lang);
    }

    // ============================================================
    //  VOIR UNE RÉCLAMATION
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
    @UseGuards(AuthentificationGuard)
    @AuditAction(ActionType.UPDATE, 'Complaint')
    async update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateComplaintDto,
        @CurrentUser() user: UserEntity,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.complaintsService.update(id, dto, lang);
    }

    // ============================================================
    // 👤 ASSIGNER UNE RÉCLAMATION
    // ============================================================
    @Patch(':id/assign')
    @UseGuards(AuthentificationGuard)
    @AuditAction(ActionType.UPDATE, 'Complaint')
    async assign(
        @Param('id', ParseUUIDPipe) id: string,
        @Body('agentId', ParseUUIDPipe) agentId: string,
        @CurrentUser() user: UserEntity,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.complaintsService.assign(id, agentId, lang);
    }

    // ============================================================
    // 🗑️ SUPPRIMER UNE RÉCLAMATION
    // ============================================================
    @Delete(':id')
    @UseGuards(AuthentificationGuard)
    @AuditAction(ActionType.DELETE, 'Complaint')
    async remove(
        @Param('id', ParseUUIDPipe) id: string,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.complaintsService.remove(id, lang);
    }
}