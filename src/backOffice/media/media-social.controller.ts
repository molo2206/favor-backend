import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { AuditAction } from 'src/audit/decorator/audit.decorator';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { langFrom } from 'src/backOffice/logistics/common/logistics-access';
import { MediaSocialService } from './services/media-social.service';
import {
  AddPostTargetsDto,
  BulkPostStatsDto,
  CreateSocialAccountDto,
  CreateSocialPostDto,
  PublishTargetDto,
  RecordAccountStatsDto,
  RecordPostStatsDto,
  SocialAccountQueryDto,
  SocialCalendarQueryDto,
  SocialPostQueryDto,
  SocialPostStatusDto,
  SocialReportQueryDto,
  SocialStatsQueryDto,
  UpdateSocialAccountDto,
  UpdateSocialPostDto,
  UpdateTargetDto,
} from './dto/social.dto';

/**
 * BackOffice — Média : gestion des réseaux sociaux
 * Ce qu'on publie, sur quelles plateformes, et les chiffres jour par jour
 * (j'aime, commentaires, partages, vues, portée, abonnés…).
 * Préfixe : /backoffice/media/social
 */
@Controller('backoffice/media/social')
@UseGuards(AuthentificationGuard)
export class MediaSocialController {
  constructor(private readonly social: MediaSocialService) { }

  // ============================================================
  // TABLEAU DE BORD & RAPPORTS
  // ============================================================
  @Get('dashboard')
  dashboard(@Req() req: Request, @CurrentUser() user: UserEntity, @Query('companyId') companyId?: string) {
    return this.social.dashboard(user, langFrom(req), companyId);
  }

  @Get('reports')
  report(@Req() req: Request, @Query() query: SocialReportQueryDto, @CurrentUser() user: UserEntity) {
    return this.social.report(query, user, langFrom(req));
  }

  /** Publications en ligne sans chiffres saisis pour la date (défaut : aujourd'hui) */
  @Get('stats/missing')
  missingStats(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Query('companyId') companyId?: string,
    @Query('date') date?: string,
    @Query('days') days?: string,
  ) {
    return this.social.missingStats(user, langFrom(req), companyId, date, Number(days) || undefined);
  }

  /** Saisie groupée des chiffres du jour */
  @Post('stats/bulk')
  @AuditAction(ActionType.CREATE, 'social_stats')
  bulkStats(@Req() req: Request, @Body() dto: BulkPostStatsDto, @CurrentUser() user: UserEntity) {
    return this.social.bulkPostStats(dto, user, langFrom(req));
  }

  @Get('calendar')
  calendar(@Req() req: Request, @Query() query: SocialCalendarQueryDto, @CurrentUser() user: UserEntity) {
    return this.social.calendar(query, user, langFrom(req));
  }

  // ============================================================
  // COMPTES / PAGES
  // ============================================================
  @Post('accounts')
  @AuditAction(ActionType.CREATE, 'social_account')
  createAccount(@Req() req: Request, @Body() dto: CreateSocialAccountDto, @CurrentUser() user: UserEntity) {
    return this.social.createAccount(dto, user, langFrom(req));
  }

  @Get('accounts')
  listAccounts(@Req() req: Request, @Query() query: SocialAccountQueryDto, @CurrentUser() user: UserEntity) {
    return this.social.listAccounts(query, user, langFrom(req));
  }

  @Get('accounts/:id')
  getAccount(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.social.getAccountDetails(id, user, langFrom(req));
  }

  @Patch('accounts/:id')
  @AuditAction(ActionType.UPDATE, 'social_account')
  updateAccount(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSocialAccountDto, @CurrentUser() user: UserEntity) {
    return this.social.updateAccount(id, dto, user, langFrom(req));
  }

  @Delete('accounts/:id')
  @AuditAction(ActionType.DELETE, 'social_account')
  deleteAccount(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.social.deleteAccount(id, user, langFrom(req));
  }

  /** Relevé du jour d'un compte : abonnés, portée, visites du profil, messages */
  @Post('accounts/:id/stats')
  @AuditAction(ActionType.CREATE, 'social_account_stats')
  recordAccountStats(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RecordAccountStatsDto, @CurrentUser() user: UserEntity) {
    return this.social.recordAccountStats(id, dto, user, langFrom(req));
  }

  @Get('accounts/:id/stats')
  accountStats(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Query() query: SocialStatsQueryDto, @CurrentUser() user: UserEntity) {
    return this.social.accountStats(id, query, user, langFrom(req));
  }

  // ============================================================
  // PUBLICATIONS
  // ============================================================
  @Post('posts')
  @AuditAction(ActionType.CREATE, 'social_post')
  createPost(@Req() req: Request, @Body() dto: CreateSocialPostDto, @CurrentUser() user: UserEntity) {
    return this.social.createPost(dto, user, langFrom(req));
  }

  @Get('posts')
  listPosts(@Req() req: Request, @Query() query: SocialPostQueryDto, @CurrentUser() user: UserEntity) {
    return this.social.listPosts(query, user, langFrom(req));
  }

  @Get('posts/:id')
  getPost(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.social.getPostDetails(id, user, langFrom(req));
  }

  @Patch('posts/:id')
  @AuditAction(ActionType.UPDATE, 'social_post')
  updatePost(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSocialPostDto, @CurrentUser() user: UserEntity) {
    return this.social.updatePost(id, dto, user, langFrom(req));
  }

  /** Brouillon → à valider → validée → programmée → publiée (ou annulée) */
  @Patch('posts/:id/status')
  @AuditAction(ActionType.UPDATE, 'social_post')
  changeStatus(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SocialPostStatusDto, @CurrentUser() user: UserEntity) {
    return this.social.changeStatus(id, dto, user, langFrom(req));
  }

  @Delete('posts/:id')
  @AuditAction(ActionType.DELETE, 'social_post')
  deletePost(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.social.deletePost(id, user, langFrom(req));
  }

  /** Évolution jour par jour des chiffres d'une publication */
  @Get('posts/:id/stats')
  postStats(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Query() query: SocialStatsQueryDto, @CurrentUser() user: UserEntity) {
    return this.social.postStats(id, query, user, langFrom(req));
  }

  @Post('posts/:id/targets')
  @AuditAction(ActionType.UPDATE, 'social_post')
  addTargets(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AddPostTargetsDto, @CurrentUser() user: UserEntity) {
    return this.social.addTargets(id, dto, user, langFrom(req));
  }

  // ============================================================
  // PUBLICATION SUR UNE PLATEFORME
  // ============================================================
  @Patch('targets/:targetId')
  @AuditAction(ActionType.UPDATE, 'social_post_target')
  updateTarget(@Req() req: Request, @Param('targetId', ParseUUIDPipe) targetId: string, @Body() dto: UpdateTargetDto, @CurrentUser() user: UserEntity) {
    return this.social.updateTarget(targetId, dto, user, langFrom(req));
  }

  /** Marquer publié sur la plateforme (lien du post) */
  @Post('targets/:targetId/publish')
  @AuditAction(ActionType.UPDATE, 'social_post_target')
  publishTarget(@Req() req: Request, @Param('targetId', ParseUUIDPipe) targetId: string, @Body() dto: PublishTargetDto, @CurrentUser() user: UserEntity) {
    return this.social.publishTarget(targetId, dto, user, langFrom(req));
  }

  @Delete('targets/:targetId')
  @AuditAction(ActionType.DELETE, 'social_post_target')
  removeTarget(@Req() req: Request, @Param('targetId', ParseUUIDPipe) targetId: string, @CurrentUser() user: UserEntity) {
    return this.social.removeTarget(targetId, user, langFrom(req));
  }

  /** Chiffres du jour pour cette plateforme (mode DAILY ou TOTAL) */
  @Post('targets/:targetId/stats')
  @AuditAction(ActionType.CREATE, 'social_stats')
  recordStats(@Req() req: Request, @Param('targetId', ParseUUIDPipe) targetId: string, @Body() dto: RecordPostStatsDto, @CurrentUser() user: UserEntity) {
    return this.social.recordPostStats(targetId, dto, user, langFrom(req));
  }
}
