import {
    Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { LeavesService } from './leaves.service';
import { CreateLeaveDto } from './dto/create-leave.dto';
import { UpdateLeaveDto } from './dto/update-leave.dto';
import { LeaveStatus } from '../common/enums/leave-status.enum';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';

@Controller('hr/leaves')
@UseGuards(AuthentificationGuard)
export class LeavesController {
    constructor(private readonly leavesService: LeavesService) { }

    @Post() create(@Body() dto: CreateLeaveDto) {
        return this.leavesService.create(dto);
    }

    @Get() findAll(
        @Query('employeeId') employeeId?: string,
        @Query('status') status?: LeaveStatus,
        @Query('page') page?: number,
        @Query('limit') limit?: number,
    ) {
        return this.leavesService.findAll({
            employeeId, status,
            page: Number(page) || 1,
            limit: Number(limit) || 20,
        });
    }

    @Get(':id') findOne(@Param('id') id: string) {
        return this.leavesService.findOne(id);
    }

    @Patch(':id/status') updateStatus(
        @Param('id') id: string,
        @Body() dto: UpdateLeaveDto,
        @CurrentUser() user: UserEntity,
    ) {
        return this.leavesService.updateStatus(id, dto, user.id);
    }

    @Delete(':id') remove(@Param('id') id: string) {
        return this.leavesService.remove(id);
    }
}