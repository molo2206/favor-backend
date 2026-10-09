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
import { AttendanceService } from './attendance.service';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { AttendanceStatus } from '../common/enums/attendance-status.enum';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { AttendanceEntity } from './entities/attendance.entity';

@Controller('hr/attendance')
@UseGuards(AuthentificationGuard)
export class AttendanceController {
    constructor(private readonly attendanceService: AttendanceService) { }

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
    // ➕ CHECK-IN
    // ============================================================
    @Post('check-in')
    @HttpCode(HttpStatus.CREATED)
    checkIn(@Body() dto: CreateAttendanceDto, @Req() req: Request) {
        const lang = this.extractLanguage(req);
        return this.attendanceService.checkIn(dto, lang);
    }

    // ============================================================
    // ➖ CHECK-OUT
    // ============================================================
    @Post('check-out/:employeeId')
    @HttpCode(HttpStatus.OK)
    checkOut(
        @Param('employeeId', ParseUUIDPipe) employeeId: string,
        @Body('checkOutAt') checkOutAt: string | undefined,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.attendanceService.checkOut(
            employeeId,
            checkOutAt ? new Date(checkOutAt) : undefined,
            lang,
        );
    }

    // ============================================================
    // 📋 LISTER LES PRÉSENCES
    // ============================================================
    @Get()
    async findAll(
        @Req() req: Request,
        @Query('employeeId') employeeId?: string,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('status') status?: AttendanceStatus,
        @Query('page') page: string = '1',
        @Query('limit') limit: string = '10',
    ): Promise<{
        message: string;
        data: PaginatedResponseDto<AttendanceEntity>;
    }> {
        const lang = this.extractLanguage(req);
        return this.attendanceService.findAll(
            {
                employeeId,
                startDate,
                endDate,
                status,
                page: Number(page),
                limit: Number(limit),
            },
            lang,
        );
    }

    // ============================================================
    // 📊 STATS D'UN EMPLOYÉ SUR UNE PÉRIODE
    // ============================================================
    @Get('stats/:employeeId')
    stats(
        @Param('employeeId', ParseUUIDPipe) employeeId: string,
        @Req() req: Request,
        @Query('startDate') startDate: string,
        @Query('endDate') endDate: string,
    ) {
        const lang = this.extractLanguage(req);
        return this.attendanceService.getEmployeeStats(
            employeeId,
            new Date(startDate),
            new Date(endDate),
            lang,
        );
    }

    // ============================================================
    // 🔍 VOIR UN POINTAGE
    // ============================================================
    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
        const lang = this.extractLanguage(req);
        return this.attendanceService.findOne(id, lang);
    }

    // ============================================================
    // 🗑️ SUPPRIMER UN POINTAGE
    // ============================================================
    @Delete(':id')
    remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
        const lang = this.extractLanguage(req);
        return this.attendanceService.remove(id, lang);
    }
}