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
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { EmployeeEntity } from './entities/employee.entity';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { UserEntity } from 'src/users/entities/user.entity';
import { AuditAction } from 'src/audit/decorator/audit.decorator';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';

@Controller('hr/employees')
export class EmployeesController {
    constructor(private readonly employeesService: EmployeesService) { }

    private extractLanguage(req: Request): string {
        const acceptLanguage = req.headers['accept-language'];
        if (!acceptLanguage) return 'fr';
        const primary = acceptLanguage.split(',')[0].split(';')[0].trim();
        const supported = ['fr', 'en', 'sw', 'es', 'ar'];
        return supported.includes(primary) ? primary : 'fr';
    }

    // ============================================================
    // ➕ CREATE (protégé)
    // ============================================================
    @Post()
    @UseGuards(AuthentificationGuard)         // ⬅️ guard ici
    @AuditAction(ActionType.CREATE, 'employees')
    @HttpCode(HttpStatus.CREATED)
    async createEmployee(
        @Body() dto: CreateEmployeeDto,
        @CurrentUser() user: UserEntity,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.employeesService.create(dto, user, lang);
    }

    // ============================================================
    // 📋 LISTER (protégé)
    // ============================================================
    @Get()
    @UseGuards(AuthentificationGuard)         // ⬅️ guard ici
    async findAll(
        @CurrentUser() user: UserEntity,
        @Req() req: Request,
        @Query('branchId') branchId?: string,
        @Query('departmentId') departmentId?: string,
        @Query('status') status?: string,
        @Query('search') search?: string,
        @Query('page') page: string = '1',
        @Query('limit') limit: string = '20',
    ) {
        const lang = this.extractLanguage(req);
        return this.employeesService.findAll(
            user,
            {
                branchId,
                departmentId,
                status,
                search,
                page: Number(page),
                limit: Number(limit),
            },
            lang,
        );
    }

    // ============================================================
    // 🔍 VOIR UN (protégé)
    // ============================================================
    @Get(':id')
    @UseGuards(AuthentificationGuard)
    async findOne(
        @Param('id', ParseUUIDPipe) id: string,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.employeesService.findOne(id, lang);
    }

    // ============================================================
    // ✏️ MODIFIER (protégé)
    // ============================================================
    @Patch(':id')
    @UseGuards(AuthentificationGuard)         // ⬅️ guard ici
    @AuditAction(ActionType.UPDATE, 'employees')
    async updateEmployee(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateEmployeeDto,
        @CurrentUser() user: UserEntity,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.employeesService.update(id, dto, user, lang);
    }

    // ============================================================
    //  SUPPRIMER (protégé)
    // ============================================================
    @Delete(':id')
    @UseGuards(AuthentificationGuard)         // ⬅️ guard ici
    @AuditAction(ActionType.DELETE, 'employees')
    async removeEmployee(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: UserEntity,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.employeesService.remove(id, user, lang);
    }
}