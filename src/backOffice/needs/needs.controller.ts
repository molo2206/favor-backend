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
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { AuditAction } from 'src/audit/decorator/audit.decorator';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { langFrom } from 'src/backOffice/logistics/common/logistics-access';
import { NeedsService } from './needs.service';
import { NeedsWorkflowService } from './needs-workflow.service';
import { NeedsReportService } from './needs-report.service';
import { NeedsConfigService } from './needs-config.service';
import { NeedsAccessService } from './common/needs-access.service';
import {
  AttachmentUploadDto,
  CancelNeedDto,
  CompanyQueryDto,
  CreateNeedDto,
  CreateNeedRuleDto,
  NeedApproveDto,
  NeedAuthorizeDto,
  NeedAvailabilityDto,
  NeedBulkApproveDto,
  NeedCommentDto,
  NeedCorrectionDto,
  NeedDisburseDto,
  NeedExecutionDto,
  NeedExportQueryDto,
  NeedQueryDto,
  NeedRejectDto,
  NeedTransmitDto,
  SimulateNeedCircuitDto,
  SubmitNeedDto,
  UpdateNeedDto,
  UpdateNeedRuleDto,
  UpsertNeedMemberDto,
} from './dto/needs.dto';

/**
 * ✅ BackOffice — ÉTATS DE BESOINS. Préfixe : /backoffice/needs
 * `companyId` facultatif partout : entreprise active de l'utilisateur par défaut.
 *
 * Agent        : créer (brouillon), modifier, joindre des devis, soumettre, suivre, annuler, relancer
 * Validateur   : inbox, approuver, rejeter (motif), demander une correction, commenter — À SON TOUR seulement
 * Finance      : transmettre, autoriser le décaissement, décaisser (partiel), suivre l'exécution
 * Administrateur : circuits, rôles, remplaçants, intervention hors tour (override), rapports
 */
@Controller('backoffice/needs')
@UseGuards(AuthentificationGuard)
export class NeedsController {
  constructor(
    private readonly needs: NeedsService,
    private readonly workflow: NeedsWorkflowService,
    private readonly reports: NeedsReportService,
    private readonly config: NeedsConfigService,
    private readonly access: NeedsAccessService,
  ) { }

  // ============================================================
  // ACCÈS / TABLEAU DE BORD / EXPORTS
  // ============================================================

  @Get('me')
  me(@Req() req: Request, @CurrentUser() user: UserEntity, @Query() q: CompanyQueryDto) {
    return this.needs.me(user, q.companyId, langFrom(req));
  }

  @Get('dashboard')
  dashboard(@Req() req: Request, @CurrentUser() user: UserEntity, @Query() q: NeedQueryDto) {
    return this.reports.dashboard(q, user, langFrom(req));
  }

  /** ?format=xlsx (défaut) ou pdf — mêmes filtres que la liste */
  @Get('export')
  async export(@Req() req: Request, @CurrentUser() user: UserEntity, @Query() q: NeedExportQueryDto, @Res() res: Response) {
    const file = await this.reports.exportList(q, user, langFrom(req));
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.send(file.content);
  }

  // ============================================================
  // CONFIGURATION (administrateur)
  // ============================================================

  @Get('config/rules')
  rules(@Req() req: Request, @CurrentUser() user: UserEntity, @Query() q: CompanyQueryDto) {
    return this.config.listRules(user, q.companyId, langFrom(req));
  }

  @Post('config/rules')
  @AuditAction(ActionType.CREATE, 'bo_need_rules')
  createRule(@Req() req: Request, @CurrentUser() user: UserEntity, @Body() dto: CreateNeedRuleDto) {
    return this.config.createRule(dto, user, langFrom(req));
  }

  /** Modèles : standard (4 niveaux), small (< 500 USD), large (≥ 5 000 USD) */
  @Post('config/rules/template/:key')
  @AuditAction(ActionType.CREATE, 'bo_need_rules')
  fromTemplate(@Req() req: Request, @CurrentUser() user: UserEntity, @Param('key') key: string, @Query() q: CompanyQueryDto) {
    return this.config.createFromTemplate(key, q.companyId, user, langFrom(req));
  }

  @Patch('config/rules/:id')
  @AuditAction(ActionType.UPDATE, 'bo_need_rules')
  updateRule(@Req() req: Request, @CurrentUser() user: UserEntity, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateNeedRuleDto) {
    return this.config.updateRule(id, dto, user, langFrom(req));
  }

  @Delete('config/rules/:id')
  @AuditAction(ActionType.DELETE, 'bo_need_rules')
  deleteRule(@Req() req: Request, @CurrentUser() user: UserEntity, @Param('id', ParseUUIDPipe) id: string) {
    return this.config.deleteRule(id, user, langFrom(req));
  }

  /** Aperçu du circuit pour un montant / département / catégorie / priorité */
  @Post('config/simulate')
  @HttpCode(HttpStatus.OK)
  simulate(@Req() req: Request, @CurrentUser() user: UserEntity, @Body() dto: SimulateNeedCircuitDto) {
    return this.config.simulate(dto, user, langFrom(req));
  }

  @Get('config/members')
  members(@Req() req: Request, @CurrentUser() user: UserEntity, @Query() q: CompanyQueryDto) {
    return this.config.listMembers(user, q.companyId, langFrom(req));
  }

  @Post('config/members')
  @AuditAction(ActionType.UPDATE, 'bo_need_members')
  upsertMember(@Req() req: Request, @CurrentUser() user: UserEntity, @Body() dto: UpsertNeedMemberDto) {
    return this.config.upsertMember(dto, user, langFrom(req));
  }

  @Delete('config/members/:userId')
  @AuditAction(ActionType.DELETE, 'bo_need_members')
  removeMember(@Req() req: Request, @CurrentUser() user: UserEntity, @Param('userId', ParseUUIDPipe) userId: string, @Query() q: CompanyQueryDto) {
    return this.config.removeMember(userId, q.companyId, user, langFrom(req));
  }

  /** Indisponibilité + remplaçant (soi-même, ou un administrateur pour un autre) */
  @Patch('config/availability')
  @AuditAction(ActionType.UPDATE, 'bo_need_members')
  availability(@Req() req: Request, @CurrentUser() user: UserEntity, @Body() dto: NeedAvailabilityDto) {
    return this.config.setAvailability(dto, user, langFrom(req));
  }

  /** Utilisateurs de l'entreprise (choix des validateurs, remplaçants, payeurs) */
  @Get('config/users')
  users(@Req() req: Request, @CurrentUser() user: UserEntity, @Query() q: CompanyQueryDto & { search?: string }) {
    return this.config.companyUsers(user, q.companyId, (req.query.search as string) || undefined, langFrom(req));
  }

  // ============================================================
  // ÉTATS DE BESOINS
  // ============================================================

  /** scope = mine | inbox | validated_by_me | finance | all ; filtres : status, priority, departmentId, requesterId, validatorId, from, to… */
  @Get()
  list(@Req() req: Request, @CurrentUser() user: UserEntity, @Query() q: NeedQueryDto) {
    return this.needs.list(q, user, langFrom(req));
  }

  /** Brouillon (submit=true pour soumettre directement) */
  @Post()
  @AuditAction(ActionType.CREATE, 'bo_need_requests')
  create(@Req() req: Request, @CurrentUser() user: UserEntity, @Body() dto: CreateNeedDto) {
    return this.needs.create(dto, user, langFrom(req));
  }

  /** Approuver plusieurs demandes (validateur, à son tour) */
  @Post('bulk-approve')
  @HttpCode(HttpStatus.OK)
  @AuditAction(ActionType.UPDATE, 'bo_need_requests')
  async bulkApprove(@Req() req: Request, @CurrentUser() user: UserEntity, @Body() dto: NeedBulkApproveDto) {
    const lang = langFrom(req);
    const results: { id: string; ok: boolean; status?: string; error?: string }[] = [];
    for (const id of [...new Set(dto.ids)]) {
      try {
        const n = await this.needs.load(id, lang);
        const ctx = await this.access.context(user, n.companyId, lang);
        const r = await this.workflow.approve(id, user, ctx, { comment: dto.comment }, lang);
        results.push({ id, ok: true, status: r.status });
      } catch (e: any) {
        results.push({ id, ok: false, error: e?.response?.message ?? e?.message });
      }
    }
    return { message: this.access.t('needs.bulk_done', lang, { ok: results.filter((r) => r.ok).length, total: results.length }), data: results };
  }

  @Get(':id')
  findOne(@Req() req: Request, @CurrentUser() user: UserEntity, @Param('id', ParseUUIDPipe) id: string) {
    return this.needs.detail(id, user, langFrom(req)).then((data) => ({ message: this.access.t('needs.detail', langFrom(req)), data }));
  }

  /** Historique complet (non modifiable) */
  @Get(':id/history')
  async history(@Req() req: Request, @CurrentUser() user: UserEntity, @Param('id', ParseUUIDPipe) id: string) {
    const d: any = await this.needs.detail(id, user, langFrom(req));
    return { message: this.access.t('needs.history', langFrom(req)), data: d.history };
  }

  /** Fiche PDF (articles, circuit, finance, historique) */
  @Get(':id/pdf')
  async pdf(@Req() req: Request, @CurrentUser() user: UserEntity, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const file = await this.reports.exportOne(id, user, langFrom(req));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.send(file.content);
  }

  /** Modifier (brouillon ou correction demandée) — items remplace toute la liste */
  @Patch(':id')
  @AuditAction(ActionType.UPDATE, 'bo_need_requests')
  update(@Req() req: Request, @CurrentUser() user: UserEntity, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateNeedDto) {
    return this.needs.update(id, dto, user, langFrom(req));
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @AuditAction(ActionType.UPDATE, 'bo_need_requests')
  submit(@Req() req: Request, @CurrentUser() user: UserEntity, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SubmitNeedDto) {
    return this.needs.submit(id, user, langFrom(req), dto?.comment);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @AuditAction(ActionType.UPDATE, 'bo_need_requests')
  cancel(@Req() req: Request, @CurrentUser() user: UserEntity, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelNeedDto) {
    return this.needs.cancel(id, dto, user, langFrom(req));
  }

  @Post(':id/comments')
  @AuditAction(ActionType.CREATE, 'bo_need_logs')
  comment(@Req() req: Request, @CurrentUser() user: UserEntity, @Param('id', ParseUUIDPipe) id: string, @Body() dto: NeedCommentDto) {
    return this.needs.comment(id, dto.comment, user, langFrom(req));
  }

  /** multipart : files[] (10 max) + kind (QUOTE, JUSTIFICATION, PAYMENT_PROOF, EXECUTION_PROOF, OTHER) */
  @Post(':id/attachments')
  @UseInterceptors(FilesInterceptor('files', 10))
  @AuditAction(ActionType.CREATE, 'bo_need_attachments')
  attach(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: AttachmentUploadDto,
  ) {
    return this.needs.uploadAttachments(id, files, dto?.kind, user, langFrom(req));
  }

  @Delete(':id/attachments/:attachmentId')
  @AuditAction(ActionType.DELETE, 'bo_need_attachments')
  detach(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ) {
    return this.needs.removeAttachment(id, attachmentId, user, langFrom(req));
  }

  // ---------- Validation (à son tour) ----------

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @AuditAction(ActionType.UPDATE, 'bo_need_requests')
  async approve(@Req() req: Request, @CurrentUser() user: UserEntity, @Param('id', ParseUUIDPipe) id: string, @Body() dto: NeedApproveDto) {
    const lang = langFrom(req);
    const n = await this.needs.load(id, lang);
    await this.workflow.approve(id, user, await this.access.context(user, n.companyId, lang), dto, lang);
    return { message: this.access.t('needs.approved', lang), data: await this.needs.detail(id, user, lang) };
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @AuditAction(ActionType.UPDATE, 'bo_need_requests')
  async reject(@Req() req: Request, @CurrentUser() user: UserEntity, @Param('id', ParseUUIDPipe) id: string, @Body() dto: NeedRejectDto) {
    const lang = langFrom(req);
    const n = await this.needs.load(id, lang);
    await this.workflow.reject(id, user, await this.access.context(user, n.companyId, lang), dto, lang);
    return { message: this.access.t('needs.rejected', lang), data: await this.needs.detail(id, user, lang) };
  }

  @Post(':id/request-correction')
  @HttpCode(HttpStatus.OK)
  @AuditAction(ActionType.UPDATE, 'bo_need_requests')
  async correction(@Req() req: Request, @CurrentUser() user: UserEntity, @Param('id', ParseUUIDPipe) id: string, @Body() dto: NeedCorrectionDto) {
    const lang = langFrom(req);
    const n = await this.needs.load(id, lang);
    await this.workflow.requestCorrection(id, user, await this.access.context(user, n.companyId, lang), dto, lang);
    return { message: this.access.t('needs.correction_requested', lang), data: await this.needs.detail(id, user, lang) };
  }

  /** Relancer le niveau en cours (demandeur ou administrateur) */
  @Post(':id/remind')
  @HttpCode(HttpStatus.OK)
  async remind(@Req() req: Request, @CurrentUser() user: UserEntity, @Param('id', ParseUUIDPipe) id: string) {
    const lang = langFrom(req);
    const n = await this.needs.load(id, lang);
    await this.workflow.remindNow(id, user, await this.access.context(user, n.companyId, lang), lang);
    return { message: this.access.t('needs.reminded', lang), data: { id } };
  }

  // ---------- Finance / exécution ----------

  @Post(':id/transmit')
  @HttpCode(HttpStatus.OK)
  @AuditAction(ActionType.UPDATE, 'bo_need_requests')
  transmit(@Req() req: Request, @CurrentUser() user: UserEntity, @Param('id', ParseUUIDPipe) id: string, @Body() dto: NeedTransmitDto) {
    return this.needs.transmit(id, dto, user, langFrom(req));
  }

  @Post(':id/authorize')
  @HttpCode(HttpStatus.OK)
  @AuditAction(ActionType.UPDATE, 'bo_need_requests')
  authorize(@Req() req: Request, @CurrentUser() user: UserEntity, @Param('id', ParseUUIDPipe) id: string, @Body() dto: NeedAuthorizeDto) {
    return this.needs.authorize(id, dto, user, langFrom(req));
  }

  /** multipart possible : files[] = justificatifs de paiement */
  @Post(':id/disbursements')
  @UseInterceptors(FilesInterceptor('files', 10))
  @AuditAction(ActionType.CREATE, 'bo_need_disbursements')
  disburse(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: NeedDisburseDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.needs.disburse(id, dto, files ?? [], user, langFrom(req));
  }

  /** multipart possible : files[] = preuves d'exécution (bons de livraison, photos…) */
  @Patch(':id/execution')
  @UseInterceptors(FilesInterceptor('files', 10))
  @AuditAction(ActionType.UPDATE, 'bo_need_requests')
  execution(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: NeedExecutionDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.needs.execution(id, dto, files ?? [], user, langFrom(req));
  }
}
