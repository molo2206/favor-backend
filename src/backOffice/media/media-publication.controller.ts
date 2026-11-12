import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { AuditAction } from 'src/audit/decorator/audit.decorator';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { langFrom } from 'src/backOffice/logistics/common/logistics-access';
import { MediaPublicationService } from './services/media-publication.service';
import {
  BulkPublicationStatsDto,
  CreatePublicationDto,
  PublicationQueryDto,
  PublicationReportQueryDto,
  RecordPublicationStatsDto,
  UpdatePublicationDto,
} from './dto/publication.dto';

/**
 * BackOffice — Média interne : publications et chiffres saisis par l'admin
 * (vues, j'aime, commentaires, partages). Préfixe : /backoffice/media/publications
 */
@Controller('backoffice/media/publications')
@UseGuards(AuthentificationGuard)
export class MediaPublicationController {
  constructor(private readonly service: MediaPublicationService) { }

  @Get('dashboard')
  dashboard(@Req() req: Request, @CurrentUser() user: UserEntity, @Query('companyId') companyId?: string) {
    return this.service.dashboard(user, langFrom(req), companyId);
  }

  @Get('report')
  report(@Req() req: Request, @Query() query: PublicationReportQueryDto, @CurrentUser() user: UserEntity) {
    return this.service.report(query, user, langFrom(req));
  }

  /** Lieux de diffusion déjà utilisés */
  @Get('channels')
  channels(@Req() req: Request, @CurrentUser() user: UserEntity, @Query('companyId') companyId?: string) {
    return this.service.channels(user, langFrom(req), companyId);
  }

  /** Saisie des chiffres de plusieurs publications en une fois */
  @Post('stats/bulk')
  @AuditAction(ActionType.CREATE, 'media_publication_stats')
  bulkStats(@Req() req: Request, @Body() dto: BulkPublicationStatsDto, @CurrentUser() user: UserEntity) {
    return this.service.bulkStats(dto, user, langFrom(req));
  }

  @Delete('stats/:statId')
  @AuditAction(ActionType.DELETE, 'media_publication_stats')
  deleteStat(@Req() req: Request, @Param('statId', ParseUUIDPipe) statId: string, @CurrentUser() user: UserEntity) {
    return this.service.deleteStat(statId, user, langFrom(req));
  }

  /** Nouvelle publication (multipart : `image` = couverture) */
  @Post()
  @AuditAction(ActionType.CREATE, 'media_publication')
  @UseInterceptors(FileInterceptor('image'))
  create(@Req() req: Request, @Body() dto: CreatePublicationDto, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: UserEntity) {
    return this.service.create(dto, file, user, langFrom(req));
  }

  @Get()
  list(@Req() req: Request, @Query() query: PublicationQueryDto, @CurrentUser() user: UserEntity) {
    return this.service.list(query, user, langFrom(req));
  }

  @Get(':id')
  findOne(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.service.findOne(id, user, langFrom(req));
  }

  @Patch(':id')
  @AuditAction(ActionType.UPDATE, 'media_publication')
  @UseInterceptors(FileInterceptor('image'))
  update(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePublicationDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: UserEntity,
  ) {
    return this.service.update(id, dto, file, user, langFrom(req));
  }

  @Delete(':id')
  @AuditAction(ActionType.DELETE, 'media_publication')
  remove(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.service.remove(id, user, langFrom(req));
  }

  /** L'admin saisit les chiffres actuels (vues, j'aime, commentaires, partages) */
  @Post(':id/stats')
  @AuditAction(ActionType.CREATE, 'media_publication_stats')
  recordStats(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RecordPublicationStatsDto, @CurrentUser() user: UserEntity) {
    return this.service.recordStats(id, dto, user, langFrom(req));
  }
}
