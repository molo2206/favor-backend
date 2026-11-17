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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { AuditAction } from 'src/audit/decorator/audit.decorator';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { langFrom } from 'src/backOffice/logistics/common/logistics-access';
import { CashFlowService } from './cash-flow.service';
import { CashFlowReportService } from './cash-flow-report.service';
import {
  AddFinanceMemberDto,
  BulkValidateDto,
  CancelCashTransactionDto,
  CashAccountQueryDto,
  CashCategoryQueryDto,
  CashClosingQueryDto,
  CashReportQueryDto,
  CashTransactionQueryDto,
  CompanyQueryDto,
  CopyForecastsDto,
  CreateCashAccountDto,
  CreateCashCategoryDto,
  CreateCashClosingDto,
  CreateCashTransactionDto,
  CreateCashTransferDto,
  ForecastQueryDto,
  ForecastVsActualQueryDto,
  LedgerQueryDto,
  ProjectionQueryDto,
  RejectCashTransactionDto,
  UpdateCashAccountDto,
  UpdateCashCategoryDto,
  UpdateCashTransactionDto,
  UpdateFinanceMemberDto,
  UpsertForecastsDto,
} from './dto/cash-flow.dto';

/**
 * ✅ BackOffice — Trésorerie (cash flow). Préfixe : /backoffice/finance/cash-flow
 * `companyId` facultatif partout : entreprise active de l'utilisateur par défaut.
 */
@Controller('backoffice/finance/cash-flow')
@UseGuards(AuthentificationGuard)
export class CashFlowController {
  constructor(
    private readonly service: CashFlowService,
    private readonly reports: CashFlowReportService,
  ) { }

  // ---------- Mon accès ----------
  @Get('me')
  me(@Req() req: Request, @CurrentUser() user: UserEntity, @Query() q: CompanyQueryDto) {
    return this.service.me(user, q.companyId, langFrom(req));
  }

  // ---------- Équipe finance (propriétaire) ----------
  @Get('members')
  members(@Req() req: Request, @CurrentUser() user: UserEntity, @Query() q: CompanyQueryDto) {
    return this.service.listMembers(user, q.companyId, langFrom(req));
  }

  @Post('members')
  @AuditAction(ActionType.CREATE, 'finance_member')
  addMember(@Req() req: Request, @Body() dto: AddFinanceMemberDto, @CurrentUser() user: UserEntity) {
    return this.service.addMember(dto, user, langFrom(req));
  }

  @Patch('members/:id')
  @AuditAction(ActionType.UPDATE, 'finance_member')
  updateMember(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFinanceMemberDto, @CurrentUser() user: UserEntity) {
    return this.service.updateMember(id, dto, user, langFrom(req));
  }

  @Delete('members/:id')
  @AuditAction(ActionType.DELETE, 'finance_member')
  removeMember(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.service.removeMember(id, user, langFrom(req));
  }

  // ---------- Comptes ----------
  @Get('accounts')
  accounts(@Req() req: Request, @Query() q: CashAccountQueryDto, @CurrentUser() user: UserEntity, @Query('convertTo') convertTo?: string) {
    return this.service.listAccounts(q, user, langFrom(req), convertTo);
  }

  @Post('accounts')
  @AuditAction(ActionType.CREATE, 'cash_account')
  createAccount(@Req() req: Request, @Body() dto: CreateCashAccountDto, @CurrentUser() user: UserEntity) {
    return this.service.createAccount(dto, user, langFrom(req));
  }

  @Get('accounts/:id')
  account(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.service.findAccount(id, user, langFrom(req));
  }

  @Patch('accounts/:id')
  @AuditAction(ActionType.UPDATE, 'cash_account')
  updateAccount(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCashAccountDto, @CurrentUser() user: UserEntity) {
    return this.service.updateAccount(id, dto, user, langFrom(req));
  }

  /** Grand livre : mouvements validés avec le solde après chacun */
  @Get('accounts/:id/ledger')
  ledger(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Query() q: LedgerQueryDto, @CurrentUser() user: UserEntity) {
    return this.reports.ledger(id, q, user, langFrom(req));
  }

  /** Solde théorique à une date (avant l'arrêté de caisse) */
  @Get('accounts/:id/expected-balance')
  expected(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity, @Query('date') date?: string) {
    return this.service.expectedBalance(id, date, user, langFrom(req));
  }

  // ---------- Rubriques ----------
  @Get('categories')
  categories(@Req() req: Request, @Query() q: CashCategoryQueryDto, @CurrentUser() user: UserEntity) {
    return this.service.listCategories(q, user, langFrom(req));
  }

  @Post('categories')
  @AuditAction(ActionType.CREATE, 'cash_category')
  createCategory(@Req() req: Request, @Body() dto: CreateCashCategoryDto, @CurrentUser() user: UserEntity) {
    return this.service.createCategory(dto, user, langFrom(req));
  }

  @Patch('categories/:id')
  @AuditAction(ActionType.UPDATE, 'cash_category')
  updateCategory(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCashCategoryDto, @CurrentUser() user: UserEntity) {
    return this.service.updateCategory(id, dto, user, langFrom(req));
  }

  // ---------- Mouvements ----------
  @Get('transactions')
  transactions(@Req() req: Request, @Query() q: CashTransactionQueryDto, @CurrentUser() user: UserEntity) {
    return this.service.listTransactions(q, user, langFrom(req));
  }

  /** Export CSV (Excel) avec les mêmes filtres que la liste */
  @Get('transactions/export')
  async export(@Req() req: Request, @Query() q: CashTransactionQueryDto, @CurrentUser() user: UserEntity, @Res() res: Response) {
    const { filename, content } = await this.reports.exportCsv(q, user, langFrom(req));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  }

  /** Entrée ou sortie (multipart possible : fichier `attachment` = reçu, facture) */
  @Post('transactions')
  @AuditAction(ActionType.CREATE, 'cash_transaction')
  @UseInterceptors(FileInterceptor('attachment'))
  createTransaction(@Req() req: Request, @Body() dto: CreateCashTransactionDto, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: UserEntity) {
    return this.service.createTransaction(dto, file, user, langFrom(req));
  }

  /** Valider plusieurs mouvements en attente */
  @Post('transactions/validate')
  @HttpCode(HttpStatus.OK)
  @AuditAction(ActionType.UPDATE, 'cash_transaction')
  bulkValidate(@Req() req: Request, @Body() dto: BulkValidateDto, @CurrentUser() user: UserEntity) {
    return this.service.bulkValidate(dto, user, langFrom(req));
  }

  @Get('transactions/:id')
  transaction(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.service.findTransaction(id, user, langFrom(req));
  }

  @Patch('transactions/:id')
  @AuditAction(ActionType.UPDATE, 'cash_transaction')
  @UseInterceptors(FileInterceptor('attachment'))
  updateTransaction(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCashTransactionDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: UserEntity,
  ) {
    return this.service.updateTransaction(id, dto, file, user, langFrom(req));
  }

  @Patch('transactions/:id/validate')
  @AuditAction(ActionType.UPDATE, 'cash_transaction')
  validate(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.service.validateTransaction(id, user, langFrom(req));
  }

  @Patch('transactions/:id/reject')
  @AuditAction(ActionType.UPDATE, 'cash_transaction')
  reject(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectCashTransactionDto, @CurrentUser() user: UserEntity) {
    return this.service.rejectTransaction(id, dto, user, langFrom(req));
  }

  @Patch('transactions/:id/cancel')
  @AuditAction(ActionType.UPDATE, 'cash_transaction')
  cancel(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelCashTransactionDto, @CurrentUser() user: UserEntity) {
    return this.service.cancelTransaction(id, dto, user, langFrom(req));
  }

  // ---------- Transferts ----------
  @Get('transfers')
  transfers(@Req() req: Request, @Query() q: CashTransactionQueryDto, @CurrentUser() user: UserEntity) {
    return this.service.listTransfers(q, user, langFrom(req));
  }

  @Post('transfers')
  @AuditAction(ActionType.CREATE, 'cash_transfer')
  createTransfer(@Req() req: Request, @Body() dto: CreateCashTransferDto, @CurrentUser() user: UserEntity) {
    return this.service.createTransfer(dto, user, langFrom(req));
  }

  @Patch('transfers/:id/validate')
  @AuditAction(ActionType.UPDATE, 'cash_transfer')
  validateTransfer(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.service.validateTransfer(id, user, langFrom(req));
  }

  // ---------- Prévisions ----------
  @Get('forecasts')
  forecasts(@Req() req: Request, @Query() q: ForecastQueryDto, @CurrentUser() user: UserEntity) {
    return this.service.listForecasts(q, user, langFrom(req));
  }

  @Post('forecasts')
  @HttpCode(HttpStatus.OK)
  @AuditAction(ActionType.UPDATE, 'cash_forecast')
  upsertForecasts(@Req() req: Request, @Body() dto: UpsertForecastsDto, @CurrentUser() user: UserEntity) {
    return this.service.upsertForecasts(dto, user, langFrom(req));
  }

  @Post('forecasts/copy')
  @HttpCode(HttpStatus.OK)
  @AuditAction(ActionType.CREATE, 'cash_forecast')
  copyForecasts(@Req() req: Request, @Body() dto: CopyForecastsDto, @CurrentUser() user: UserEntity) {
    return this.service.copyForecasts(dto, user, langFrom(req));
  }

  // ---------- Arrêtés de caisse ----------
  @Get('closings')
  closings(@Req() req: Request, @Query() q: CashClosingQueryDto, @CurrentUser() user: UserEntity) {
    return this.service.listClosings(q, user, langFrom(req));
  }

  @Post('closings')
  @AuditAction(ActionType.CREATE, 'cash_closing')
  createClosing(@Req() req: Request, @Body() dto: CreateCashClosingDto, @CurrentUser() user: UserEntity) {
    return this.service.createClosing(dto, user, langFrom(req));
  }

  // ---------- Rapports ----------
  @Get('reports/dashboard')
  dashboard(@Req() req: Request, @Query() q: CashReportQueryDto, @CurrentUser() user: UserEntity) {
    return this.reports.dashboard(q, user, langFrom(req));
  }

  /** Tableau des flux de trésorerie (exploitation / investissement / financement) */
  @Get('reports/statement')
  statement(@Req() req: Request, @Query() q: CashReportQueryDto, @CurrentUser() user: UserEntity) {
    return this.reports.statement(q, user, langFrom(req));
  }

  @Get('reports/forecast-vs-actual')
  forecastVsActual(@Req() req: Request, @Query() q: ForecastVsActualQueryDto, @CurrentUser() user: UserEntity) {
    return this.reports.forecastVsActual(q, user, langFrom(req));
  }

  @Get('reports/projection')
  projection(@Req() req: Request, @Query() q: ProjectionQueryDto, @CurrentUser() user: UserEntity) {
    return this.reports.projection(q, user, langFrom(req));
  }
}
