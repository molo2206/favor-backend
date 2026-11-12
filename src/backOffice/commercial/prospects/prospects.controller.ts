import {
    Body,
    Controller,
    Delete,
    ForbiddenException,
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
import {
    AssignProspectDto,
    BulkAssignProspectsDto,
    CheckProspectDuplicatesDto,
    LinkProspectAccountDto,
    ProspectActivitiesQueryDto,
    ProspectAssignmentsQueryDto,
    ProspectPerformanceQueryDto,
} from './dto/prospect-tracking.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { ProspectsService } from './prospects.service';
import { ProspectPerformanceService } from './prospect-performance.service';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { ProspectEntity } from './entities/prospect.entity';

/**
 * ✅ PROSPECTS
 *
 *  POST   /commercial/prospects                         créer (pays, ville, source + réseau social, langues ; 409 si doublon)
 *  GET    /commercial/prospects                         liste ?status=&assignedToId=&createdById=&countryId=&cityId=&source=&socialNetwork=&language=&hasAccount=&startDate=&endDate=&search=
 *  POST   /commercial/prospects/check-duplicates        { phone?, email?, excludeProspectId? } → compte / prospect / client existants
 *  POST   /commercial/prospects/assign-bulk             { prospectIds[], toUserId, note? }   (admins)
 *
 *  Administrateurs / super administrateurs
 *  GET    /commercial/prospects/performance             tableau de bord des agents ?agentId=&startDate=&endDate=&countryId=&cityId=&status=&source=&period=day|week|month|year
 *  GET    /commercial/prospects/assignments             assignations / transferts ?assignedById=&toUserId=&fromUserId=&type=&status=&startDate=&endDate=
 *  GET    /commercial/prospects/activities              journal des activités ?userId=&action=&prospectId=&startDate=&endDate=
 *
 *  GET    /commercial/prospects/:id                     détail
 *  PATCH  /commercial/prospects/:id                     modifier
 *  POST   /commercial/prospects/:id/assign              { toUserId | null, note? }   assigner / transférer / retirer
 *  GET    /commercial/prospects/:id/history             historique + transferts
 *  GET    /commercial/prospects/:id/account             compte existant (complet pour les admins, masqué pour les autres)
 *  POST   /commercial/prospects/:id/link-account        { userId? } rattacher au compte existant
 *  POST   /commercial/prospects/:id/unlink-account
 *  POST   /commercial/prospects/:id/convert             convertir en client (réutilise le compte existant, jamais de doublon)
 *  DELETE /commercial/prospects/:id
 */
@Controller('commercial/prospects')
@UseGuards(AuthentificationGuard)
export class ProspectsController {
    constructor(
        private readonly prospectsService: ProspectsService,
        private readonly performanceService: ProspectPerformanceService,
    ) { }

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

    /** Tableau de bord, transferts, journal : administrateurs et super administrateurs */
    private assertAdmin(user: UserEntity) {
        const r: any = (user as any)?.role;
        const role = String(Array.isArray(r) ? r[0] : r ?? '').toUpperCase();
        if (!['ADMIN', 'SUPER ADMIN'].includes(role)) {
            throw new ForbiddenException('Réservé aux administrateurs et super administrateurs');
        }
    }

    // ============================================================
    // ➕ CRÉER UN PROSPECT
    // ============================================================
    @Post()
    @HttpCode(HttpStatus.CREATED)
    create(@Body() dto: CreateProspectDto, @Req() req: Request, @CurrentUser() user: UserEntity) {
        const lang = this.extractLanguage(req);
        return this.prospectsService.create(dto, lang, user as any);
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
    // 🔎 DOUBLONS (avant d'enregistrer ou de convertir)
    // ============================================================
    @Post('check-duplicates')
    @HttpCode(HttpStatus.OK)
    checkDuplicates(@Body() dto: CheckProspectDuplicatesDto, @Req() req: Request, @CurrentUser() user: UserEntity) {
        return this.prospectsService.checkDuplicates(dto, user as any, this.extractLanguage(req));
    }

    @Post('assign-bulk')
    @HttpCode(HttpStatus.OK)
    bulkAssign(@Body() dto: BulkAssignProspectsDto, @Req() req: Request, @CurrentUser() user: UserEntity) {
        // ✅ Assignation en masse : administrateurs et super administrateurs seulement
        this.assertAdmin(user);
        return this.prospectsService.bulkAssign(dto, user as any, this.extractLanguage(req));
    }

    // ============================================================
    // 📊 TABLEAU DE BORD DES AGENTS (admins)
    // ============================================================
    @Get('performance')
    performance(@Query() q: ProspectPerformanceQueryDto, @Req() req: Request, @CurrentUser() user: UserEntity) {
        this.assertAdmin(user);
        return this.performanceService.performance(q, this.extractLanguage(req));
    }

    @Get('assignments')
    assignments(@Query() q: ProspectAssignmentsQueryDto, @Req() req: Request, @CurrentUser() user: UserEntity) {
        this.assertAdmin(user);
        return this.performanceService.assignments(q, this.extractLanguage(req));
    }

    @Get('activities')
    activities(@Query() q: ProspectActivitiesQueryDto, @Req() req: Request, @CurrentUser() user: UserEntity) {
        this.assertAdmin(user);
        return this.performanceService.activities(q, this.extractLanguage(req));
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
        @CurrentUser() user: UserEntity,
    ) {
        const lang = this.extractLanguage(req);
        return this.prospectsService.update(id, dto, lang, user as any);
    }

    // ============================================================
    // 👥 ASSIGNER / TRANSFÉRER
    // ============================================================
    @Post(':id/assign')
    @HttpCode(HttpStatus.OK)
    assign(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignProspectDto, @Req() req: Request, @CurrentUser() user: UserEntity) {
        return this.prospectsService.assign(id, dto, user as any, this.extractLanguage(req));
    }

    @Get(':id/history')
    history(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
        return this.prospectsService.history(id, this.extractLanguage(req));
    }

    // ============================================================
    // 🔗 COMPTE EXISTANT
    // ============================================================
    @Get(':id/account')
    account(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request, @CurrentUser() user: UserEntity) {
        return this.prospectsService.account(id, user as any, this.extractLanguage(req));
    }

    @Post(':id/link-account')
    @HttpCode(HttpStatus.OK)
    linkAccount(@Param('id', ParseUUIDPipe) id: string, @Body() dto: LinkProspectAccountDto, @Req() req: Request, @CurrentUser() user: UserEntity) {
        return this.prospectsService.linkAccount(id, dto, user as any, this.extractLanguage(req));
    }

    @Post(':id/unlink-account')
    @HttpCode(HttpStatus.OK)
    unlinkAccount(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request, @CurrentUser() user: UserEntity) {
        return this.prospectsService.unlinkAccount(id, user as any, this.extractLanguage(req));
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
        @CurrentUser() user: UserEntity,
    ) {
        const lang = this.extractLanguage(req);
        return this.prospectsService.convertToCustomer(id, dto, lang, user as any);
    }

    // ============================================================
    // 🗑️ SUPPRIMER UN PROSPECT
    // ============================================================
    @Delete(':id')
    remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request, @CurrentUser() user: UserEntity) {
        const lang = this.extractLanguage(req);
        return this.prospectsService.remove(id, lang, user as any);
    }
}
