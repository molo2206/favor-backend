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
import { LeavesService } from './leaves.service';
import { CreateLeaveDto } from './dto/create-leave.dto';
import { UpdateLeaveDto } from './dto/update-leave.dto';
import { LeaveStatus } from '../common/enums/leave-status.enum';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { LeaveEntity } from './entities/leave.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { AuditAction } from 'src/audit/decorator/audit.decorator';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';

@Controller('hr/leaves')
export class LeavesController {
    constructor(private readonly leavesService: LeavesService) { }

    private extractLanguage(req: Request): string {
        const acceptLanguage = req.headers['accept-language'];
        if (!acceptLanguage) return 'fr';
        const primary = acceptLanguage.split(',')[0].split(';')[0].trim();
        const supported = ['fr', 'en', 'sw', 'es', 'ar'];
        return supported.includes(primary) ? primary : 'fr';
    }

    // ➕ CREATE
    @Post()
    @UseGuards(AuthentificationGuard)
    @AuditAction(ActionType.CREATE, 'leaves')
    @HttpCode(HttpStatus.CREATED)
    async create(
        @Body() dto: CreateLeaveDto,
        @CurrentUser() user: UserEntity,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.leavesService.create(dto, user, lang);
    }

    // 📋 FIND ALL
    @Get()
    @UseGuards(AuthentificationGuard)
    async findAll(
        @Req() req: Request,
        @Query('employeeId') employeeId?: string,
        @Query('status') status?: LeaveStatus,
        @Query('search') search?: string,
        @Query('page') page: string = '1',
        @Query('limit') limit: string = '20',
    ): Promise<{
        message: string;
        data: PaginatedResponseDto<LeaveEntity>;
    }> {
        const lang = this.extractLanguage(req);
        return this.leavesService.findAll(
            {
                employeeId,
                status,
                search,
                page: Number(page),
                limit: Number(limit),
            },
            lang,
        );
    }

    // 🔍 FIND ONE
    @Get(':id')
    async findOne(
        @Param('id', ParseUUIDPipe) id: string,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.leavesService.findOne(id, lang);
    }

    // ✏️ UPDATE STATUS
    @Patch(':id/status')
    @UseGuards(AuthentificationGuard)
    @AuditAction(ActionType.UPDATE, 'leaves')
    async updateStatus(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateLeaveDto,
        @CurrentUser() user: UserEntity,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.leavesService.updateStatus(id, dto, user, lang);
    }

    // 🗑️ REMOVE
    @Delete(':id')
    @UseGuards(AuthentificationGuard)
    @AuditAction(ActionType.DELETE, 'leaves')
    async remove(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: UserEntity,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.leavesService.remove(id, user, lang);
    }
}