import {
    Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { CensusService } from './census.service';
import { CreateCensusDto, CreateFollowupDto, ImportInactiveDto, QueryCandidatesDto, QueryCensusDto, UpdateCensusDto } from './dto/census.dto';

/**
 * ✅ RECENSEMENT DES CLIENTS ET VENDEURS — relance des anciens clients
 *
 *  GET    /commercial/census/candidates            clients / entreprises EXISTANTS à recenser (avec leur fiche ou non)
 *  POST   /commercial/census                       nouvelle fiche (userId pour un client, vendorCompanyId pour une entreprise)
 *  GET    /commercial/census                       liste (type, status, cityId, assignedToId, search, due=true, inactiveDays)
 *  GET    /commercial/census/stats                 statistiques
 *  POST   /commercial/census/import-inactive       fiches des anciens clients / vendeurs de la plateforme
 *  GET    /commercial/census/:id                   fiche + activité sur la plateforme + relances
 *  PATCH  /commercial/census/:id                   modifier
 *  DELETE /commercial/census/:id                   supprimer
 *  POST   /commercial/census/:id/followups         enregistrer une relance (appel, SMS, WhatsApp, visite…)
 */
@Controller('commercial/census')
@UseGuards(AuthentificationGuard)
export class CensusController {
    constructor(private readonly census: CensusService) { }

    private lang(req: Request): string {
        const acceptLanguage = req.headers['accept-language'];
        if (!acceptLanguage) return 'fr';
        const primary = acceptLanguage.split(',')[0].split(';')[0].trim().slice(0, 2);
        return ['fr', 'en', 'sw', 'es', 'ar'].includes(primary) ? primary : 'fr';
    }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    create(@Body() dto: CreateCensusDto, @CurrentUser() user: UserEntity, @Req() req: Request) {
        return this.census.create(dto, user, this.lang(req));
    }

    @Get()
    findAll(@Query() query: QueryCensusDto, @Req() req: Request) {
        return this.census.findAll(query, this.lang(req));
    }

    @Get('candidates')
    candidates(@Query() query: QueryCandidatesDto, @Req() req: Request) {
        return this.census.candidates(query, this.lang(req));
    }

    @Get('stats')
    stats(@Query('type') type: string, @Query('assignedToId') assignedToId: string, @Req() req: Request) {
        return this.census.stats({ type, assignedToId }, this.lang(req));
    }

    @Post('import-inactive')
    @HttpCode(HttpStatus.OK)
    importInactive(@Body() dto: ImportInactiveDto, @CurrentUser() user: UserEntity, @Req() req: Request) {
        return this.census.importInactive(dto, user, this.lang(req));
    }

    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
        return this.census.findOne(id, this.lang(req));
    }

    @Patch(':id')
    update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCensusDto, @Req() req: Request) {
        return this.census.update(id, dto, this.lang(req));
    }

    @Delete(':id')
    remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
        return this.census.remove(id, this.lang(req));
    }

    @Post(':id/followups')
    @HttpCode(HttpStatus.CREATED)
    addFollowup(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: CreateFollowupDto,
        @CurrentUser() user: UserEntity,
        @Req() req: Request,
    ) {
        return this.census.addFollowup(id, dto, user, this.lang(req));
    }
}
