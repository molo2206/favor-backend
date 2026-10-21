import {
    Controller,
    Get,
    Query,
    Req,
    UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { CommercialDashboardService } from './dashboard.service';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';

@Controller('commercial/dashboard')
@UseGuards(AuthentificationGuard)
export class CommercialDashboardController {
    constructor(private readonly dashboardService: CommercialDashboardService) { }

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
    // 📊 GET FULL DASHBOARD
    // ============================================================
    @Get()
    getDashboard(
        @Req() req: Request,
        @Query('companyId') companyId?: string,
        @Query('assignedToId') assignedToId?: string,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('topLimit') topLimit: string = '5',
    ) {
        const lang = this.extractLanguage(req);
        return this.dashboardService.getDashboard(
            companyId,
            assignedToId,
            startDate,
            endDate,
            Number(topLimit) || 5,
            lang,
        );
    }
}