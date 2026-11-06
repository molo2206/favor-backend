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
import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { DepartmentEntity } from './entities/department.entity';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { UserEntity } from 'src/users/entities/user.entity';
import { AuditAction } from 'src/audit/decorator/audit.decorator';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';

@Controller('hr/departments')
@UseGuards(AuthentificationGuard)
export class DepartmentsController {
    constructor(private readonly departmentsService: DepartmentsService) { }

    private extractLanguage(req: Request): string {
        const acceptLanguage = req.headers['accept-language'];
        if (!acceptLanguage) return 'fr';
        const primary = acceptLanguage.split(',')[0].split(';')[0].trim();
        const supported = ['fr', 'en', 'sw', 'es', 'ar'];
        return supported.includes(primary) ? primary : 'fr';
    }

    // ============================================================
    // ➕ CRÉER UN DÉPARTEMENT
    // ============================================================
    @Post()
    @AuditAction(ActionType.CREATE, 'departments')
    @HttpCode(HttpStatus.CREATED)
    async createDepartment(
        @Body() dto: CreateDepartmentDto,
        @CurrentUser() user: UserEntity,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.departmentsService.create(dto, user, lang);
    }

    // ============================================================
    // 📋 LISTER LES DÉPARTEMENTS
    // ============================================================
    @Get()
    async findAll(
        @CurrentUser() user: UserEntity,
        @Req() req: Request,
        @Query('companyId') companyId?: string,
        @Query('search') search?: string,
        @Query('page') page: string = '1',
        @Query('limit') limit: string = '10',
    ): Promise<{
        message: string;
        data: PaginatedResponseDto<DepartmentEntity>;
    }> {
        const lang = this.extractLanguage(req);
        return this.departmentsService.findAll(
            companyId,
            search,
            Number(page),
            Number(limit),
            lang,
        );
    }

    // ============================================================
    // 🔍 VOIR UN DÉPARTEMENT
    // ============================================================
    @Get(':id')
    async findOne(
        @Param('id', ParseUUIDPipe) id: string,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.departmentsService.findOne(id, lang);
    }

    // ============================================================
    // ✏️ MODIFIER UN DÉPARTEMENT
    // ============================================================
    @Patch(':id')
    @AuditAction(ActionType.UPDATE, 'departments')
    async updateDepartment(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateDepartmentDto,
        @CurrentUser() user: UserEntity,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.departmentsService.update(id, dto, user, lang);
    }

    // ============================================================
    // 👤 ASSIGNER UN MANAGER
    // ============================================================
    @Patch(':id/assign')
    @AuditAction(ActionType.UPDATE, 'departments')
    async assignManager(
        @Param('id', ParseUUIDPipe) id: string,
        @Body('managerId', ParseUUIDPipe) managerId: string,
        @CurrentUser() user: UserEntity,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.departmentsService.assign(id, managerId, user, lang);
    }

    // ============================================================
    // 🗑️ SUPPRIMER UN DÉPARTEMENT
    // ============================================================
    @Delete(':id')
    @AuditAction(ActionType.DELETE, 'departments')
    async removeDepartment(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: UserEntity,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.departmentsService.remove(id, user, lang);
    }
}