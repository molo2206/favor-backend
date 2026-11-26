import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { AuditAction } from 'src/audit/decorator/audit.decorator';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { langFrom } from 'src/backOffice/logistics/common/logistics-access';
import { CashApprovalService } from './cash-approval.service';
import {
  BulkCashApprovalDto,
  CashApprovalCommentDto,
  CashApprovalDecisionDto,
  CashApprovalQueryDto,
  CashApprovalRejectDto,
  CompanyQueryDto,
  CreateCashApprovalRuleDto,
  SimulateCashApprovalDto,
  UpdateCashApprovalRuleDto,
} from './dto/cash-flow.dto';

/**
 * ✅ Trésorerie — CIRCUIT DE VALIDATION (niveaux d'approbation). Préfixe : /backoffice/finance/cash-flow
 *
 * Règles (responsable financier) :
 *   GET    approval-rules                    règles de l'entreprise
 *   POST   approval-rules                    créer { name, scope, minAmount, maxAmount?, currency, levels[…] }
 *   PATCH  approval-rules/:id                modifier
 *   DELETE approval-rules/:id                supprimer
 *   GET    approval-rules/templates          modèles prêts à l'emploi
 *   POST   approval-rules/templates          { companyId?, keys? } créer les modèles
 *   POST   approval-rules/simulate           { scope, amount, currency, categoryId?, accountId? } → circuit appliqué
 *
 * Demandes :
 *   GET    approvals/inbox                   à valider par moi (badge + liste)
 *   GET    approvals/stats                   tableau de bord du circuit
 *   GET    approvals?status=&mine=&…         liste
 *   GET    approvals/:id                     détail + niveaux + historique + opération
 *   POST   approvals/:id/seen                j'ouvre la demande → ma sonnerie s'arrête
 *   POST   approvals/:id/approve             { comment? }   valider mon niveau
 *   POST   approvals/:id/reject              { reason }     refuser
 *   POST   approvals/:id/comment             { comment }
 *   POST   approvals/:id/remind              rappeler les validateurs (demandeur / responsable)
 *   POST   approvals/:id/cancel              { reason }     retirer la demande
 *   POST   approvals/:id/force               { comment? }   valider d'office (propriétaire / admin)
 *   POST   approvals/bulk-approve            { ids[], comment? }
 */
@Controller('backoffice/finance/cash-flow')
@UseGuards(AuthentificationGuard)
export class CashApprovalController {
  constructor(private readonly approvals: CashApprovalService) { }

  // ---------- Règles ----------
  @Get('approval-rules')
  rules(@Req() req: Request, @CurrentUser() user: UserEntity, @Query() q: CompanyQueryDto) {
    return this.approvals.listRules(user, q.companyId, langFrom(req));
  }

  @Get('approval-rules/templates')
  templates(@Req() req: Request) {
    return this.approvals.templates(langFrom(req));
  }

  @Post('approval-rules/templates')
  @AuditAction(ActionType.CREATE, 'cash_approval_rule')
  applyTemplates(@Req() req: Request, @CurrentUser() user: UserEntity, @Body() body: { companyId?: string; keys?: string[] }) {
    return this.approvals.applyTemplates(user, body?.companyId, Array.isArray(body?.keys) ? body.keys : undefined, langFrom(req));
  }

  @Post('approval-rules/simulate')
  @HttpCode(HttpStatus.OK)
  simulate(@Req() req: Request, @CurrentUser() user: UserEntity, @Body() dto: SimulateCashApprovalDto) {
    return this.approvals.simulate(dto, user, langFrom(req));
  }

  @Post('approval-rules')
  @AuditAction(ActionType.CREATE, 'cash_approval_rule')
  createRule(@Req() req: Request, @CurrentUser() user: UserEntity, @Body() dto: CreateCashApprovalRuleDto) {
    return this.approvals.createRule(dto, user, langFrom(req));
  }

  @Patch('approval-rules/:id')
  @AuditAction(ActionType.UPDATE, 'cash_approval_rule')
  updateRule(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity, @Body() dto: UpdateCashApprovalRuleDto) {
    return this.approvals.updateRule(id, dto, user, langFrom(req));
  }

  @Delete('approval-rules/:id')
  @AuditAction(ActionType.DELETE, 'cash_approval_rule')
  deleteRule(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.approvals.deleteRule(id, user, langFrom(req));
  }

  // ---------- Demandes ----------
  @Get('approvals/inbox')
  inbox(@Req() req: Request, @CurrentUser() user: UserEntity, @Query() q: CompanyQueryDto) {
    return this.approvals.inbox(user, q.companyId, langFrom(req));
  }

  @Get('approvals/stats')
  stats(@Req() req: Request, @CurrentUser() user: UserEntity, @Query() q: CompanyQueryDto) {
    return this.approvals.stats(user, q.companyId, langFrom(req));
  }

  @Post('approvals/bulk-approve')
  @HttpCode(HttpStatus.OK)
  @AuditAction(ActionType.UPDATE, 'cash_approval')
  bulkApprove(@Req() req: Request, @CurrentUser() user: UserEntity, @Body() dto: BulkCashApprovalDto) {
    return this.approvals.bulkApprove(dto, user, langFrom(req));
  }

  @Get('approvals')
  list(@Req() req: Request, @CurrentUser() user: UserEntity, @Query() q: CashApprovalQueryDto) {
    return this.approvals.list(q, user, langFrom(req));
  }

  @Get('approvals/:id')
  detail(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.approvals.detail(id, user, langFrom(req));
  }

  @Post('approvals/:id/seen')
  @HttpCode(HttpStatus.OK)
  seen(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.approvals.seen(id, user, langFrom(req));
  }

  @Post('approvals/:id/approve')
  @HttpCode(HttpStatus.OK)
  @AuditAction(ActionType.UPDATE, 'cash_approval')
  approve(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity, @Body() dto: CashApprovalDecisionDto) {
    return this.approvals.approve(id, user, dto ?? {}, langFrom(req));
  }

  @Post('approvals/:id/reject')
  @HttpCode(HttpStatus.OK)
  @AuditAction(ActionType.UPDATE, 'cash_approval')
  reject(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity, @Body() dto: CashApprovalRejectDto) {
    return this.approvals.reject(id, user, dto, langFrom(req));
  }

  @Post('approvals/:id/comment')
  @HttpCode(HttpStatus.OK)
  comment(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity, @Body() dto: CashApprovalCommentDto) {
    return this.approvals.comment(id, user, dto, langFrom(req));
  }

  @Post('approvals/:id/remind')
  @HttpCode(HttpStatus.OK)
  remind(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.approvals.remind(id, user, langFrom(req));
  }

  @Post('approvals/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @AuditAction(ActionType.UPDATE, 'cash_approval')
  cancel(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity, @Body() dto: CashApprovalRejectDto) {
    return this.approvals.cancel(id, user, dto, langFrom(req));
  }

  @Post('approvals/:id/force')
  @HttpCode(HttpStatus.OK)
  @AuditAction(ActionType.UPDATE, 'cash_approval')
  force(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity, @Body() dto: CashApprovalDecisionDto) {
    return this.approvals.force(id, user, dto ?? {}, langFrom(req));
  }
}
