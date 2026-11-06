import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Request } from 'express';
import { AgentPaymentsService } from '../services/agent-payments.service';
import { CreateAgentPaymentDto } from '../dto/create-agent-payment.dto';
import { UpdateAgentPaymentDto } from '../dto/update-agent-payment.dto';
import { ListAgentPaymentQueryDto } from '../dto/list-agent-payment-query.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';

@Controller('hr/agent-payments')

export class AgentPaymentsController {
  constructor(private readonly paymentsService: AgentPaymentsService) { }

  private extractLanguage(req: Request): string {
    const acceptLanguage = req.headers['accept-language'];
    if (!acceptLanguage) return 'fr';
    const primary = acceptLanguage.split(',')[0].split(';')[0].trim();
    const supported = ['fr', 'en', 'sw', 'es', 'ar'];
    return supported.includes(primary) ? primary : 'fr';
  }

  // ============================================================
  // ➕ CRÉER UN PAIEMENT (SALARY / ADVANCE / REFUND / BONUS / PENALTY)
  // ============================================================
  @Post()
  @UseGuards(AuthentificationGuard)
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateAgentPaymentDto,
    @CurrentUser() user: UserEntity,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    return this.paymentsService.create(dto, user, lang);
  }

  // ============================================================
  // 📋 LISTER
  // ============================================================
  @Get()
  @UseGuards(AuthentificationGuard)
  findAll(
    @Query() query: ListAgentPaymentQueryDto,
    @CurrentUser() user: UserEntity,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    return this.paymentsService.findAll(query, user, lang);
  }

  // ============================================================
  // 📊 STATISTIQUES PAR EMPLOYÉ
  // ============================================================
  @Get('stats/:employeeId')
  getStatsByEmployee(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    return this.paymentsService.getStatsByEmployee(employeeId, lang);
  }

  // ============================================================
  // 📋 AVANCES D'UN EMPLOYÉ
  // ============================================================
  @Get('employee/:employeeId/advances')
  @UseGuards(AuthentificationGuard)
  getEmployeeAdvances(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Query('onlyPending') onlyPending?: string,
    @Req() req?: Request,
  ) {
    const lang = this.extractLanguage(req!);
    return this.paymentsService.getEmployeeAdvances(
      employeeId,
      onlyPending === 'true',
      lang,
    );
  }

  // ============================================================
  // 🔍 VOIR
  // ============================================================
  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    return this.paymentsService.findOne(id, lang);
  }

  // ============================================================
  // ✏️ MODIFIER
  // ============================================================
  @Patch(':id')
  @UseGuards(AuthentificationGuard)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAgentPaymentDto,
    @CurrentUser() user: UserEntity,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    return this.paymentsService.update(id, dto, user, lang);
  }

  // ============================================================
  // ✅ MARQUER COMME PAYÉ
  // ============================================================
  @Patch(':id/mark-as-paid')
  @UseGuards(AuthentificationGuard)
  markAsPaid(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: UserEntity,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    return this.paymentsService.markAsPaid(id, user, lang);
  }

  // ============================================================
  // 🗑️ SUPPRIMER
  // ============================================================
  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    return this.paymentsService.remove(id, lang);
  }
}