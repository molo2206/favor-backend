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
    UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { PayslipService } from '../services/payslip.service';
import { UpdatePayslipLineDto } from '../dto/update-payslip-line.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { AuditAction } from 'src/audit/decorator/audit.decorator';
import { AddPayslipLineDto } from '../dto/add-payslip-line.dto';

@Controller('payroll/payslips')
@UseGuards(AuthentificationGuard)
export class PayslipController {
    constructor(private readonly service: PayslipService) {}

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
    // 🔍 VOIR UNE FICHE DE PAIE
    // ============================================================
    @Get(':id')
    async findOne(
        @Param('id', ParseUUIDPipe) id: string,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.service.findOne(id, lang);
    }

    // ============================================================
    // 📄 DÉTAIL COMPLET (pour PDF / impression)
    // ============================================================
    @Get(':id/detailed')
    async getDetailed(
        @Param('id', ParseUUIDPipe) id: string,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.service.getDetailedPayslip(id, lang);
    }

    // ============================================================
    // 📋 LISTER LES FICHES D'UN CYCLE
    // ============================================================
    @Get('run/:payrollRunId')
    async listByRun(
        @Param('payrollRunId', ParseUUIDPipe) payrollRunId: string,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.service.listByRun(payrollRunId, lang);
    }

    // ============================================================
    // 📊 STATISTIQUES D'UN CYCLE
    // ============================================================
    @Get('run/:payrollRunId/stats')
    async getRunStats(
        @Param('payrollRunId', ParseUUIDPipe) payrollRunId: string,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.service.getRunStats(payrollRunId, lang);
    }

    // ============================================================
    // 📋 LISTER LES FICHES D'UN EMPLOYÉ
    // ============================================================
    @Get('employee/:employeeId')
    async listByEmployee(
        @Param('employeeId', ParseUUIDPipe) employeeId: string,
        @Query('period') period: string | undefined,
        @Query('page') page: number | undefined,
        @Query('limit') limit: number | undefined,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.service.listByEmployee(
            employeeId,
            { period, page, limit },
            lang,
        );
    }

    // ============================================================
    // ✏️ MODIFIER UNE LIGNE
    // ============================================================
    @Patch(':payslipId/lines/:lineId')
    @AuditAction(ActionType.UPDATE, 'PayslipLine')
    async updateLine(
        @Param('payslipId', ParseUUIDPipe) payslipId: string,
        @Param('lineId', ParseUUIDPipe) lineId: string,
        @Body() dto: UpdatePayslipLineDto,
        @CurrentUser() user: UserEntity,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.service.updateLine(payslipId, lineId, dto, user, lang);
    }

    // ============================================================
    // ➕ AJOUTER UNE LIGNE MANUELLE
    // ============================================================
    @Post(':payslipId/lines')
    @HttpCode(HttpStatus.CREATED)
    @AuditAction(ActionType.CREATE, 'PayslipLine')
    async addLine(
        @Param('payslipId', ParseUUIDPipe) payslipId: string,
        @Body() dto: AddPayslipLineDto,
        @CurrentUser() user: UserEntity,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.service.addLine(payslipId, dto, user, lang);
    }

    // ============================================================
    // 🗑️ SUPPRIMER UNE LIGNE
    // ============================================================
    @Delete(':payslipId/lines/:lineId')
    @AuditAction(ActionType.DELETE, 'PayslipLine')
    async removeLine(
        @Param('payslipId', ParseUUIDPipe) payslipId: string,
        @Param('lineId', ParseUUIDPipe) lineId: string,
        @CurrentUser() user: UserEntity,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.service.removeLine(payslipId, lineId, user, lang);
    }

    // ============================================================
    // ✅ VALIDER UNE FICHE
    // ============================================================
    @Post(':id/validate')
    @AuditAction(ActionType.UPDATE, 'Payslip')
    async validate(
        @Param('id', ParseUUIDPipe) id: string,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.service.validate(id, lang);
    }

    // ============================================================
    // ↩️ REPASSER EN DRAFT
    // ============================================================
    @Post(':id/revert')
    @AuditAction(ActionType.UPDATE, 'Payslip')
    async revert(
        @Param('id', ParseUUIDPipe) id: string,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.service.revertToDraft(id, lang);
    }
}