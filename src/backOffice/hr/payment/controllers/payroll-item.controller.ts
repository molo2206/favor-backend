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
import { PayrollItemService } from '../services/payroll-item.service';
import { CreatePayrollItemDto } from '../dto/create-payroll-item.dto';
import { AssignPayrollItemDto } from '../dto/assign-payroll-item.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { AuditAction } from 'src/audit/decorator/audit.decorator';
import { UpdatePayrollItemDto } from '../dto/update-payroll-item.dto';

@Controller('payroll/items')
@UseGuards(AuthentificationGuard)
export class PayrollItemController {
    constructor(private readonly service: PayrollItemService) { }

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
    // ➕ CRÉER UN ITEM
    // ============================================================
    @Post()
    @HttpCode(HttpStatus.CREATED)
    @AuditAction(ActionType.CREATE, 'PayrollItem')
    async create(
        @Body() dto: CreatePayrollItemDto,
        @CurrentUser() user: UserEntity,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.service.create(dto, user, lang);
    }

    // ============================================================
    // 📋 LISTER LES ITEMS
    // ============================================================
    @Get()
    async findAll(
        @CurrentUser() user: UserEntity,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.service.findAll(user, lang);
    }

    // ============================================================
    // 🔍 VOIR UN ITEM
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
    // ✏️ MODIFIER UN ITEM
    // ============================================================
    @Patch(':id')
    @AuditAction(ActionType.UPDATE, 'PayrollItem')
    async update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdatePayrollItemDto,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.service.update(id, dto, lang);
    }

    // ============================================================
    // 🗑️ SUPPRIMER UN ITEM
    // ============================================================
    @Delete(':id')
    @AuditAction(ActionType.DELETE, 'PayrollItem')
    async remove(
        @Param('id', ParseUUIDPipe) id: string,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.service.remove(id, lang);
    }

    // ============================================================
    // 🔗 ASSIGNER UN ITEM À UN EMPLOYÉ
    // ============================================================
    @Post('employees/:employeeId/assign')
    @HttpCode(HttpStatus.CREATED)
    @AuditAction(ActionType.CREATE, 'EmployeePayrollItem')
    async assign(
        @Param('employeeId', ParseUUIDPipe) employeeId: string,
        @Body() dto: AssignPayrollItemDto,
        @CurrentUser() user: UserEntity,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.service.assignToEmployee(employeeId, dto, user, lang);
    }

    // ============================================================
    // 📋 LISTER LES ITEMS D'UN EMPLOYÉ
    // ============================================================
    @Get('employees/:employeeId')
    async findEmployeeItems(
        @Param('employeeId', ParseUUIDPipe) employeeId: string,
        @CurrentUser() user: UserEntity,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.service.findEmployeeItems(employeeId, user, lang);
    }

    // ============================================================
    // 🔄 ACTIVER / DÉSACTIVER UN ITEM POUR UN EMPLOYÉ
    // ============================================================
    @Patch('employees/:employeeId/items/:payrollItemId/toggle')
    @AuditAction(ActionType.UPDATE, 'EmployeePayrollItem')
    async toggle(
        @Param('employeeId', ParseUUIDPipe) employeeId: string,
        @Param('payrollItemId', ParseUUIDPipe) payrollItemId: string,
        @Body('isActive') isActive: boolean,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.service.toggleEmployeeItem(employeeId, payrollItemId, isActive, lang);
    }

    // ============================================================
    // 🗑️ RETIRER UN ITEM D'UN EMPLOYÉ
    // ============================================================
    @Delete('employees/:employeeId/items/:payrollItemId')
    @AuditAction(ActionType.DELETE, 'EmployeePayrollItem')
    async removeFromEmployee(
        @Param('employeeId', ParseUUIDPipe) employeeId: string,
        @Param('payrollItemId', ParseUUIDPipe) payrollItemId: string,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.service.removeFromEmployee(employeeId, payrollItemId, lang);
    }
}