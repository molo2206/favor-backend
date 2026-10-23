import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { AuditAction } from 'src/audit/decorator/audit.decorator';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { langFrom } from 'src/backOffice/logistics/common/logistics-access';
import { MediaCatalogService } from './services/media-catalog.service';
import { MediaProjectService } from './services/media-project.service';
import { MediaScheduleService } from './services/media-schedule.service';
import { MediaLibraryService } from './services/media-library.service';
import {
  AddMediaPaymentDto,
  AssignCrewDto,
  AvailabilityQueryDto,
  BookEquipmentDto,
  ChangeProjectStatusDto,
  CreateMediaFileDto,
  CreateMediaProjectDto,
  CreateMediaServiceDto,
  CreateMediaSessionDto,
  CreateTeamMemberDto,
  MediaFileQueryDto,
  MediaProjectQueryDto,
  MediaServiceQueryDto,
  ProjectNoteDto,
  SessionQueryDto,
  SessionStatusDto,
  SetProjectItemsDto,
  ShareProjectDto,
  UpdateMediaFileDto,
  UpdateMediaProjectDto,
  UpdateMediaServiceDto,
  UpdateMediaSessionDto,
  UpdateTeamMemberDto,
} from './dto/media.dto';

/**
 * BackOffice — Média : filmage, photographie, drone, live, montage, design, réseaux sociaux…
 * Préfixe : /backoffice/media
 */
@Controller('backoffice/media')
@UseGuards(AuthentificationGuard)
export class MediaController {
  constructor(
    private readonly catalog: MediaCatalogService,
    private readonly projects: MediaProjectService,
    private readonly schedule: MediaScheduleService,
    private readonly library: MediaLibraryService,
  ) { }

  // ============================================================
  // TABLEAU DE BORD
  // ============================================================
  @Get('dashboard')
  dashboard(@Req() req: Request, @CurrentUser() user: UserEntity, @Query('companyId') companyId?: string) {
    return this.projects.dashboard(user, langFrom(req), companyId);
  }

  // ============================================================
  // CATALOGUE DES PRESTATIONS
  // ============================================================
  @Post('services')
  @AuditAction(ActionType.CREATE, 'media_service')
  createService(@Req() req: Request, @Body() dto: CreateMediaServiceDto, @CurrentUser() user: UserEntity) {
    return this.catalog.createService(dto, user, langFrom(req));
  }

  @Get('services')
  listServices(@Req() req: Request, @Query() query: MediaServiceQueryDto, @CurrentUser() user: UserEntity) {
    return this.catalog.listServices(query, user, langFrom(req));
  }

  @Patch('services/:id')
  @AuditAction(ActionType.UPDATE, 'media_service')
  updateService(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMediaServiceDto, @CurrentUser() user: UserEntity) {
    return this.catalog.updateService(id, dto, user, langFrom(req));
  }

  @Delete('services/:id')
  @AuditAction(ActionType.DELETE, 'media_service')
  deleteService(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.catalog.deleteService(id, user, langFrom(req));
  }

  // ============================================================
  // ÉQUIPE
  // ============================================================
  @Post('team')
  @AuditAction(ActionType.CREATE, 'media_team')
  addMember(@Req() req: Request, @Body() dto: CreateTeamMemberDto, @CurrentUser() user: UserEntity) {
    return this.catalog.addMember(dto, user, langFrom(req));
  }

  @Get('team')
  listMembers(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Query('companyId') companyId?: string,
    @Query('role') role?: string,
  ) {
    return this.catalog.listMembers(user, langFrom(req), companyId, role);
  }

  @Patch('team/:id')
  @AuditAction(ActionType.UPDATE, 'media_team')
  updateMember(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTeamMemberDto, @CurrentUser() user: UserEntity) {
    return this.catalog.updateMember(id, dto, user, langFrom(req));
  }

  @Delete('team/:id')
  @AuditAction(ActionType.DELETE, 'media_team')
  removeMember(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.catalog.removeMember(id, user, langFrom(req));
  }

  // ============================================================
  // PROJETS / COMMANDES
  // ============================================================
  @Post('projects')
  @AuditAction(ActionType.CREATE, 'media_project')
  createProject(@Req() req: Request, @Body() dto: CreateMediaProjectDto, @CurrentUser() user: UserEntity) {
    return this.projects.create(dto, user, langFrom(req));
  }

  @Get('projects')
  listProjects(@Req() req: Request, @Query() query: MediaProjectQueryDto, @CurrentUser() user: UserEntity) {
    return this.projects.list(query, user, langFrom(req));
  }

  /** Projets en cours du membre connecté (chef de projet ou équipe) */
  @Get('projects/mine')
  myProjects(@Req() req: Request, @CurrentUser() user: UserEntity, @Query('companyId') companyId?: string) {
    return this.projects.myProjects(user, langFrom(req), companyId);
  }

  @Get('projects/:id')
  findProject(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.projects.findOne(id, user, langFrom(req));
  }

  @Patch('projects/:id')
  @AuditAction(ActionType.UPDATE, 'media_project')
  updateProject(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMediaProjectDto, @CurrentUser() user: UserEntity) {
    return this.projects.update(id, dto, user, langFrom(req));
  }

  /** Remplace les lignes du devis */
  @Post('projects/:id/items')
  @AuditAction(ActionType.UPDATE, 'media_project')
  setItems(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetProjectItemsDto, @CurrentUser() user: UserEntity) {
    return this.projects.setItems(id, dto.items, user, langFrom(req));
  }

  @Patch('projects/:id/status')
  @AuditAction(ActionType.UPDATE, 'media_project')
  changeProjectStatus(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangeProjectStatusDto, @CurrentUser() user: UserEntity) {
    return this.projects.changeStatus(id, dto, user, langFrom(req));
  }

  @Post('projects/:id/notes')
  @AuditAction(ActionType.UPDATE, 'media_project')
  addNote(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ProjectNoteDto, @CurrentUser() user: UserEntity) {
    return this.projects.addNote(id, dto, user, langFrom(req));
  }

  @Post('projects/:id/payments')
  @AuditAction(ActionType.CREATE, 'media_payment')
  addPayment(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AddMediaPaymentDto, @CurrentUser() user: UserEntity) {
    return this.projects.addPayment(id, dto, user, langFrom(req));
  }

  @Delete('projects/:id/payments/:paymentId')
  @AuditAction(ActionType.DELETE, 'media_payment')
  deletePayment(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @CurrentUser() user: UserEntity,
  ) {
    return this.projects.deletePayment(id, paymentId, user, langFrom(req));
  }

  /** Lien de livraison privé pour le client (galerie des livrables) */
  @Post('projects/:id/share')
  @AuditAction(ActionType.UPDATE, 'media_project')
  share(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ShareProjectDto, @CurrentUser() user: UserEntity) {
    return this.projects.share(id, dto ?? {}, user, langFrom(req));
  }

  @Delete('projects/:id/share')
  @AuditAction(ActionType.UPDATE, 'media_project')
  revokeShare(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.projects.revokeShare(id, user, langFrom(req));
  }

  // ============================================================
  // PLANNING DES TOURNAGES / SÉANCES
  // ============================================================
  @Post('projects/:id/sessions')
  @AuditAction(ActionType.CREATE, 'media_session')
  createSession(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateMediaSessionDto, @CurrentUser() user: UserEntity) {
    return this.schedule.create(id, dto, user, langFrom(req));
  }

  /** Calendrier (?from=&to=&userId=&assetId=&projectId=&status=) */
  @Get('sessions')
  calendar(@Req() req: Request, @Query() query: SessionQueryDto, @CurrentUser() user: UserEntity) {
    return this.schedule.calendar(query, user, langFrom(req));
  }

  /** Mon planning */
  @Get('sessions/mine')
  mySchedule(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Query('companyId') companyId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.schedule.mySchedule(user, langFrom(req), companyId, from, to);
  }

  /** Équipe et matériel libres sur un créneau */
  @Get('availability')
  availability(@Req() req: Request, @Query() query: AvailabilityQueryDto, @CurrentUser() user: UserEntity) {
    return this.schedule.availability(query, user, langFrom(req));
  }

  @Get('sessions/:id')
  findSession(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.schedule.findOne(id, user, langFrom(req));
  }

  @Patch('sessions/:id')
  @AuditAction(ActionType.UPDATE, 'media_session')
  updateSession(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMediaSessionDto, @CurrentUser() user: UserEntity) {
    return this.schedule.update(id, dto, user, langFrom(req));
  }

  @Patch('sessions/:id/status')
  @AuditAction(ActionType.UPDATE, 'media_session')
  sessionStatus(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SessionStatusDto, @CurrentUser() user: UserEntity) {
    return this.schedule.changeStatus(id, dto, user, langFrom(req));
  }

  @Delete('sessions/:id')
  @AuditAction(ActionType.DELETE, 'media_session')
  deleteSession(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.schedule.remove(id, user, langFrom(req));
  }

  @Post('sessions/:id/crew')
  @AuditAction(ActionType.UPDATE, 'media_session')
  addCrew(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignCrewDto, @CurrentUser() user: UserEntity) {
    return this.schedule.addCrew(id, dto, user, langFrom(req));
  }

  @Delete('sessions/:id/crew/:userId')
  @AuditAction(ActionType.UPDATE, 'media_session')
  removeCrew(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: UserEntity,
  ) {
    return this.schedule.removeCrew(id, userId, user, langFrom(req));
  }

  /** Réserver du matériel (bien de l'entreprise : caméra, drone, éclairage…) */
  @Post('sessions/:id/equipment')
  @AuditAction(ActionType.UPDATE, 'media_session')
  addEquipment(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: BookEquipmentDto, @CurrentUser() user: UserEntity) {
    return this.schedule.addEquipment(id, dto, user, langFrom(req));
  }

  @Delete('sessions/:id/equipment/:assetId')
  @AuditAction(ActionType.UPDATE, 'media_session')
  removeEquipment(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @CurrentUser() user: UserEntity,
  ) {
    return this.schedule.removeEquipment(id, assetId, user, langFrom(req));
  }

  // ============================================================
  // MÉDIATHÈQUE
  // ============================================================
  /** multipart/form-data : champ(s) fichier (n'importe quel nom) + projectId, title, isDeliverable, isPortfolio, tags… ; ou url seule */
  @Post('files')
  @AuditAction(ActionType.CREATE, 'media_file')
  @UseInterceptors(AnyFilesInterceptor())
  addFiles(
    @Req() req: Request,
    @Body() dto: CreateMediaFileDto,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: UserEntity,
  ) {
    return this.library.add(dto, files ?? [], user, langFrom(req));
  }

  @Get('files')
  listFiles(@Req() req: Request, @Query() query: MediaFileQueryDto, @CurrentUser() user: UserEntity) {
    return this.library.list(query, user, langFrom(req));
  }

  @Patch('files/:id')
  @AuditAction(ActionType.UPDATE, 'media_file')
  updateFile(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMediaFileDto, @CurrentUser() user: UserEntity) {
    return this.library.update(id, dto, user, langFrom(req));
  }

  @Delete('files/:id')
  @AuditAction(ActionType.DELETE, 'media_file')
  deleteFile(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.library.remove(id, user, langFrom(req));
  }
}
