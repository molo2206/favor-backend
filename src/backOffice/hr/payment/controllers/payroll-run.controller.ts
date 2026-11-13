import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    ParseUUIDPipe,
    Post,
    Query,
    Req,
    UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { PayrollRunService } from '../services/payroll-run.service';
import { CreatePayrollRunDto } from '../dto/create-payroll-run.dto';
import { PayPayrollRunDto } from '../dto/pay-payroll-run.dto';
import { PayrollRunStatus } from '../enums/payroll-run-status.enum';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { AuditAction } from 'src/audit/decorator/audit.decorator';

@Controller('payroll/runs')
@UseGuards(AuthentificationGuard)
export class PayrollRunController {
    constructor(private readonly service: PayrollRunService) { }

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
    // ➕ CRÉER UN CYCLE DE PAIE
    // ============================================================
    @Post()
    @HttpCode(HttpStatus.CREATED)
    @AuditAction(ActionType.CREATE, 'PayrollRun')
    async create(
        @Body() dto: CreatePayrollRunDto,
        @CurrentUser() user: UserEntity,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.service.createRun(dto, user, lang);
    }

    // ============================================================
    // 📋 LISTER LES CYCLES
    // ============================================================
    @Get()
    async findAll(
        @CurrentUser() user: UserEntity,
        @Query('status') status: PayrollRunStatus | undefined,
        @Query('period') period: string | undefined,
        @Query('page') page: number | undefined,
        @Query('limit') limit: number | undefined,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.service.findAllRuns(
            user,
            { status, period, page, limit },
            lang,
        );
    }

    // ============================================================
    // 🔍 VOIR UN CYCLE COMPLET
    // ============================================================
    @Get(':id')
    async findOne(
        @Param('id', ParseUUIDPipe) id: string,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.service.findOneRun(id, lang);
    }

    // ============================================================
    // ✅ VALIDER UN CYCLE (DRAFT → VALIDATED)
    // ============================================================
    @Post(':id/validate')
    @AuditAction(ActionType.UPDATE, 'PayrollRun')
    async validate(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: UserEntity,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.service.validateRun(id, user, lang);
    }

    // ============================================================
    // 💰 PAYER UN CYCLE (crée N AgentPaymentEntity)
    // ============================================================
    @Post(':id/pay')
    @AuditAction(ActionType.UPDATE, 'PayrollRun')
    async pay(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: PayPayrollRunDto,
        @CurrentUser() user: UserEntity,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.service.payRun(id, dto, user, lang);
    }

    // ============================================================
    // ❌ ANNULER UN CYCLE
    // ============================================================
    @Post(':id/cancel')
    @AuditAction(ActionType.UPDATE, 'PayrollRun')
    async cancel(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: UserEntity,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.service.cancelRun(id, user, lang);
    }

    // ============================================================
    // 🗑️ SUPPRIMER UN CYCLE (DRAFT/CANCELLED uniquement)
    // ============================================================
    @Delete(':id')
    @AuditAction(ActionType.DELETE, 'PayrollRun')
    async remove(
        @Param('id', ParseUUIDPipe) id: string,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.service.removeRun(id, lang);
    }
}