import {
    Body, Controller, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { CommissionsService } from './commissions.service';
import { CommissionStatus } from '../common/enums/commission-status.enum';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';

@Controller('commercial/commissions')
@UseGuards(AuthentificationGuard)
export class CommissionsController {
    constructor(private readonly commissionsService: CommissionsService) { }

    @Post() create(@Body() body: any) {
        return this.commissionsService.create(body);
    }

    @Get() findAll(
        @Query('salesRepId') salesRepId?: string,
        @Query('status') status?: CommissionStatus,
        @Query('page') page?: number,
        @Query('limit') limit?: number,
    ) {
        return this.commissionsService.findAll({
            salesRepId, status,
            page: Number(page) || 1,
            limit: Number(limit) || 20,
        });
    }

    @Get('total/:salesRepId')
    total(@Param('salesRepId') salesRepId: string) {
        return this.commissionsService.getTotalBySalesRep(salesRepId);
    }

    @Patch(':id/status') updateStatus(
        @Param('id') id: string,
        @Body('status') status: CommissionStatus,
    ) {
        return this.commissionsService.updateStatus(id, status);
    }
}